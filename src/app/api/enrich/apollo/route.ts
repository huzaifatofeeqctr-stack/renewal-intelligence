import { NextRequest, NextResponse } from 'next/server';
import { requireCronOrAdmin } from '@/lib/auth';
import { notifyOps } from '@/lib/slack';
import { runEnrichBatch, previewEnrich } from '@/lib/enrich';
import { getSessionUser } from '@/lib/authn';
import { logUserAction } from '@/lib/user-audit';

export const dynamic = 'force-dynamic';

// GET: pre-flight preview for the confirmation popup — how many contacts are
// enrichable (≈ Apollo credits) across how many accounts. Spends nothing.
export async function GET(req: NextRequest) {
  try {
    const denied = await requireCronOrAdmin(req);
    if (denied) return denied;
    const preview = await previewEnrich(req.nextUrl.searchParams.get('account'));
    return NextResponse.json(preview);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST (cron auth): enriches incomplete, non-junk contacts via Apollo
// people/match in renewal-priority order. Fill-only-empty into Mongo
// (Salesforce is never written). Job/title changes fire signals. When a full
// batch runs, a follow-up job is queued for the hourly jobs cron.
export async function POST(req: NextRequest) {
  try {
    const denied = await requireCronOrAdmin(req);
    if (denied) return denied;
    const result = await runEnrichBatch({
      mode: 'enrich',
      accountScope: req.nextUrl.searchParams.get('account'),
      createdBy: 'manual',
      // ?all=1 (the global run button): ignore the workspace batch budget and
      // chain background jobs until the whole backlog is done.
      ignoreLimits: req.nextUrl.searchParams.get('all') === '1',
      // ?scope=everything: re-enrich every named contact, not just incomplete
      // ones outside the cooldown.
      refreshAll: req.nextUrl.searchParams.get('scope') === 'everything',
    });
    const sessionUser = await getSessionUser();
    if (sessionUser) {
      await logUserAction(
        sessionUser.email,
        'enrich.run',
        `${req.nextUrl.searchParams.get('account') ? `account ${req.nextUrl.searchParams.get('account')}` : 'all accounts'}${req.nextUrl.searchParams.get('scope') === 'everything' ? ' (re-enrich everything)' : ''}: ${result.enriched}/${result.candidates} enriched, ${result.signals} signals`
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('apollo-enrich failed:', e);
    await notifyOps(`*apollo-enrich* crashed: ${message.slice(0, 400)}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
