import { NextRequest, NextResponse } from 'next/server';
import { requireCronOrAdmin } from '@/lib/auth';
import { notifyOps } from '@/lib/slack';
import { runEnrichBatch } from '@/lib/enrich';

export const dynamic = 'force-dynamic';

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
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('apollo-enrich failed:', e);
    await notifyOps(`*apollo-enrich* crashed: ${message.slice(0, 400)}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
