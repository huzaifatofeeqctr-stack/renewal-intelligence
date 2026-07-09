import { NextRequest, NextResponse } from 'next/server';
import { requireCronOrAdmin } from '@/lib/auth';
import { getWorkspaceSettings, nowInZone } from '@/lib/workspace';
import { notifyOps } from '@/lib/slack';
import { runEnrichBatch } from '@/lib/enrich';

export const dynamic = 'force-dynamic';

// Daily champion watch: re-verifies already-complete contacts on a cadence so
// job/title changes surface even when nothing is missing in the CRM. Signals
// only — Salesforce stays read-only.
export async function GET(req: NextRequest) {
  try {
    const denied = await requireCronOrAdmin(req);
    if (denied) return denied;

    const settings = await getWorkspaceSettings();
    if (!settings.champion_watch_enabled && req.nextUrl.searchParams.get('force') !== '1') {
      return NextResponse.json({ skipped: true, reason: 'champion watch is paused in workspace settings' });
    }
    if (req.nextUrl.searchParams.get('scheduled') === '1') {
      const { hour } = nowInZone(settings.timezone);
      if (hour !== settings.champion_watch_hour) {
        return NextResponse.json({
          skipped: true,
          reason: `scheduled for ${settings.champion_watch_hour}:00 ${settings.timezone}, now ${hour}:00`,
        });
      }
    }

    const result = await runEnrichBatch({ mode: 'watch', createdBy: 'cron' });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('champion-watch failed:', e);
    await notifyOps(`*champion-watch* crashed: ${message.slice(0, 400)}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
