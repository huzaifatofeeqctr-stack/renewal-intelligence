import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { RunLogDoc, JobDoc } from '@/lib/types';
import ActivityTables, { RunRow, JobRow } from './ActivityTables';

export const dynamic = 'force-dynamic';

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function ActivityPage() {
  await requireUser();

  let runs: RunRow[] = [];
  let jobs: JobRow[] = [];
  let loadError: string | null = null;
  try {
    const [runLog, jobsColl] = await Promise.all([coll<RunLogDoc>('enrichment_run_log'), coll<JobDoc>('jobs')]);
    const [rawRuns, rawJobs] = await Promise.all([
      runLog.find({}).sort({ run_at: -1 }).limit(100).toArray(),
      jobsColl.find({}).sort({ created_at: -1 }).limit(20).toArray(),
    ]);
    runs = rawRuns.map((r) => ({
      id: r._id.toString(),
      workflow_name: r.workflow_name,
      run_at: r.run_at,
      items_in: r.items_in ?? 0,
      items_skipped_junk: r.items_skipped_junk ?? 0,
      items_processed: r.items_processed ?? 0,
      errors: r.errors ?? 0,
      notes: r.notes ?? '',
      items: (r.items ?? []).map((i) => ({ name: i.name, action: i.action, detail: i.detail })),
    }));
    jobs = rawJobs.map((j) => ({
      id: j._id.toString(),
      type: j.type,
      status: j.status,
      account_sfdc_id: j.params?.account_sfdc_id ?? null,
      created_at: j.created_at,
      created_by: j.created_by,
      started_at: j.started_at,
      finished_at: j.finished_at,
      attempts: j.attempts ?? 0,
      result: j.result,
      error: j.error,
    }));
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const last24 = runs.filter((r) => r.run_at >= dayAgo);
  const errors24 = last24.reduce((n, r) => n + r.errors, 0);
  const processed24 = last24.reduce((n, r) => n + r.items_processed, 0);
  const lastSync = runs.find((r) => r.workflow_name === 'sf-sync');
  const pendingJobs = jobs.filter((j) => j.status === 'pending' || j.status === 'running');

  return (
    <main>
      <h1>Activity</h1>
      <p className="subtitle">
        Every sync, enrichment, watch, and intel run — click a row for the full input/output detail.
      </p>

      {loadError ? (
        <div className="empty">Could not reach MongoDB ({loadError}).</div>
      ) : (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <strong>{lastSync ? timeAgo(lastSync.run_at) : 'never'}</strong>
              <small>last Salesforce sync</small>
            </div>
            <div className="stat-tile">
              <strong>{last24.length}</strong>
              <small>runs in 24h</small>
            </div>
            <div className="stat-tile">
              <strong>{processed24}</strong>
              <small>items processed in 24h</small>
            </div>
            <div className={`stat-tile${errors24 > 0 ? ' bad' : ''}`}>
              <strong>{errors24}</strong>
              <small>errors in 24h</small>
            </div>
            <div className="stat-tile">
              <strong>{pendingJobs.length}</strong>
              <small>queued background jobs</small>
            </div>
          </div>

          <ActivityTables runs={runs} jobs={jobs} />
        </>
      )}
    </main>
  );
}
