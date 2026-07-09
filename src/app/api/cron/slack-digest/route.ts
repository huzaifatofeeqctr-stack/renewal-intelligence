import { NextRequest, NextResponse } from 'next/server';
import { requireCronOrAdmin } from '@/lib/auth';
import { coll, isDuplicateKeyError } from '@/lib/db';
import { getWorkspaceSettings, nowInZone } from '@/lib/workspace';
import { sendSlackText, notifyOps } from '@/lib/slack';
import type { SignalDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SEVERITY_EMOJI: Record<string, string> = {
  critical: ':rotating_light:',
  warning: ':warning:',
  info: ':information_source:',
};

// Daily Slack digest (when slack_mode is 'digest'): collects signals that
// haven't been notified yet, groups them by account owner, and sends one
// message. notification_log's unique index keeps each signal to one send.
export async function GET(req: NextRequest) {
  try {
    const denied = await requireCronOrAdmin(req);
    if (denied) return denied;

    const settings = await getWorkspaceSettings();
    const force = req.nextUrl.searchParams.get('force') === '1';
    if (settings.slack_mode !== 'digest' && !force) {
      return NextResponse.json({ skipped: true, reason: 'slack_mode is instant — per-signal alerts are in effect' });
    }
    if (req.nextUrl.searchParams.get('scheduled') === '1') {
      const { hour } = nowInZone(settings.timezone);
      if (hour !== settings.slack_digest_hour) {
        return NextResponse.json({
          skipped: true,
          reason: `scheduled for ${settings.slack_digest_hour}:00 ${settings.timezone}, now ${hour}:00`,
        });
      }
    }

    const signals = await coll<SignalDoc>('signals');
    const notifications = await coll('notification_log');

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const candidates = await signals
      .find({ detected_at: { $gte: since }, dismissed: false })
      .sort({ severity: 1, detected_at: -1 })
      .limit(200)
      .toArray();
    const notified = new Set(
      (
        await notifications
          .find({ signal_key: { $in: candidates.map((s) => s.signal_key) } })
          .project<{ signal_key: string }>({ signal_key: 1 })
          .toArray()
      ).map((n) => n.signal_key)
    );
    const fresh = candidates.filter((s) => !notified.has(s.signal_key));

    if (fresh.length === 0) return NextResponse.json({ sent: false, reason: 'nothing new to report' });

    // Group by account owner so each CSM sees their book called out.
    const byOwner = new Map<string, SignalDoc[]>();
    for (const s of fresh) {
      const owner = s.csm_email || 'unassigned';
      byOwner.set(owner, [...(byOwner.get(owner) ?? []), s]);
    }

    const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const sections = [...byOwner.entries()].map(([owner, list]) => {
      const lines = list
        .sort((a, b) => order[a.severity] - order[b.severity])
        .map((s) => `${SEVERITY_EMOJI[s.severity] ?? ''} *${s.account_name}* — ${s.summary}`);
      return `*@${owner}*\n${lines.join('\n')}`;
    });
    const text = `:newspaper: *Renewal Intelligence — daily digest* (${fresh.length} new signal${fresh.length === 1 ? '' : 's'})\n\n${sections.join('\n\n')}`;

    const sent = await sendSlackText(text);
    if (sent) {
      for (const s of fresh) {
        try {
          await notifications.insertOne({
            signal_key: s.signal_key,
            notified_at: new Date().toISOString(),
            channel: 'slack-digest',
          });
        } catch (e) {
          if (!isDuplicateKeyError(e)) throw e;
        }
      }
    }

    return NextResponse.json({ sent, signals: fresh.length, owners: byOwner.size });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('slack-digest failed:', e);
    await notifyOps(`*slack-digest* crashed: ${message.slice(0, 400)}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
