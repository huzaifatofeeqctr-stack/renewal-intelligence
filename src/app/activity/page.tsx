import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { RunLogDoc, JobDoc } from '@/lib/types';

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

  let runs: (RunLogDoc & { _id: { toString(): string } })[] = [];
  let jobs: (JobDoc & { _id: { toString(): string } })[] = [];
  let loadError: string | null = null;
  try {
    const [runLog, jobsColl] = await Promise.all([coll<RunLogDoc>('enrichment_run_log'), coll<JobDoc>('jobs')]);
    [runs, jobs] = await Promise.all([
      runLog.find({}).sort({ run_at: -1 }).limit(100).toArray() as Promise<typeof runs>,
      jobsColl.find({}).sort({ created_at: -1 }).limit(20).toArray() as Promise<typeof jobs>,
    ]);
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
      <p className="subtitle">Every sync, enrichment, watch, and intel run — plus the background job queue.</p>

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

          {jobs.length > 0 && (
            <div className="panel">
              <h2>Background jobs</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Queued</th>
                      <th>Finished</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j._id.toString()}>
                        <td>{j.type.replaceAll('_', ' ')}{j.params.account_sfdc_id ? ' (one account)' : ''}</td>
                        <td>
                          <span className={`badge ${j.status === 'failed' ? 'critical' : j.status === 'done' ? 'ok' : 'muted'}`}>
                            {j.status}
                          </span>
                        </td>
                        <td>{timeAgo(j.created_at)}</td>
                        <td>{j.finished_at ? timeAgo(j.finished_at) : '—'}</td>
                        <td>{j.error ?? j.result ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="panel">
            <h2>Run log</h2>
            {runs.length === 0 ? (
              <div className="empty">No runs recorded yet.</div>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Workflow</th>
                      <th>When</th>
                      <th>In</th>
                      <th>Processed</th>
                      <th>Errors</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r._id.toString()}>
                        <td>{r.workflow_name}</td>
                        <td title={new Date(r.run_at).toLocaleString()}>{timeAgo(r.run_at)}</td>
                        <td>{r.items_in}</td>
                        <td>{r.items_processed}</td>
                        <td>{r.errors > 0 ? <span className="badge critical">{r.errors}</span> : 0}</td>
                        <td className="notes-cell">{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
