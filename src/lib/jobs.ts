import { coll } from './db';
import type { JobDoc } from './types';

// Tiny background job queue. Long backlogs (e.g. enrichment when Apollo
// credits trickle back) are enqueued here and drained by the hourly
// /api/cron/jobs runner — resumable and observable instead of living inside
// one HTTP request.

async function jobsColl() {
  return coll<JobDoc>('jobs');
}

// Enqueue unless an identical job is already pending/running (no pile-ups).
export async function enqueueJob(
  type: JobDoc['type'],
  params: JobDoc['params'],
  createdBy: string
): Promise<boolean> {
  const jobs = await jobsColl();
  const existing = await jobs.findOne({
    type,
    status: { $in: ['pending', 'running'] },
    'params.account_sfdc_id': params.account_sfdc_id ?? null,
  });
  if (existing) return false;
  await jobs.insertOne({
    type,
    status: 'pending',
    params: { account_sfdc_id: params.account_sfdc_id ?? null },
    created_at: new Date().toISOString(),
    created_by: createdBy,
    started_at: null,
    finished_at: null,
    attempts: 0,
    result: null,
    error: null,
  });
  return true;
}

// Atomically claim the oldest pending job (also reclaims jobs stuck in
// 'running' for over 2h — a previous runner that died mid-flight).
export async function claimNextJob(): Promise<(JobDoc & { _id: unknown }) | null> {
  const jobs = await jobsColl();
  const staleCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const res = await jobs.findOneAndUpdate(
    {
      $or: [
        { status: 'pending' },
        { status: 'running', started_at: { $lt: staleCutoff } },
      ],
      attempts: { $lt: 5 },
    },
    {
      $set: { status: 'running', started_at: new Date().toISOString() },
      $inc: { attempts: 1 },
    },
    { sort: { created_at: 1 }, returnDocument: 'after' }
  );
  return (res as (JobDoc & { _id: unknown }) | null) ?? null;
}

export async function finishJob(id: unknown, outcome: { result?: string; error?: string }): Promise<void> {
  const jobs = await jobsColl();
  await jobs.updateOne(
    { _id: id } as Record<string, unknown>,
    {
      $set: {
        status: outcome.error ? 'failed' : 'done',
        finished_at: new Date().toISOString(),
        result: outcome.result ?? null,
        error: outcome.error ?? null,
      },
    }
  );
}
