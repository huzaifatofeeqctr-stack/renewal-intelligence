import { NextRequest, NextResponse } from 'next/server';
import { requireCronOrAdmin } from '@/lib/auth';
import { claimNextJob, finishJob } from '@/lib/jobs';
import { notifyOps } from '@/lib/slack';
import { runEnrichBatch } from '@/lib/enrich';

export const dynamic = 'force-dynamic';

// Hourly job-queue runner: claims one pending background job and executes it.
// Enrichment backlogs enqueue follow-up jobs when a batch fills, so the queue
// drains itself over successive hours — resumable and observable in /activity.
export async function GET(req: NextRequest) {
  try {
    const denied = await requireCronOrAdmin(req);
    if (denied) return denied;

    const job = await claimNextJob();
    if (!job) return NextResponse.json({ ran: false, reason: 'no pending jobs' });

    try {
      const result = await runEnrichBatch({
        mode: job.type === 'champion_watch' ? 'watch' : 'enrich',
        accountScope: job.params.account_sfdc_id,
        createdBy: `job:${job.created_by}`,
        ignoreLimits: job.params.ignore_limits === true,
        refreshAll: job.params.refresh_all === true,
      });
      await finishJob(job._id, {
        result: `processed=${result.enriched} signals=${result.signals} errors=${result.errors}`,
      });
      return NextResponse.json({ ran: true, type: job.type, ...result });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await finishJob(job._id, { error: message.slice(0, 500) });
      await notifyOps(`*jobs* runner failed on a ${job.type} job: ${message.slice(0, 400)}`);
      return NextResponse.json({ ran: true, type: job.type, error: message }, { status: 500 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('jobs cron failed:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
