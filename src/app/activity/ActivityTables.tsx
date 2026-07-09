'use client';

import { useState } from 'react';

export interface RunRow {
  id: string;
  workflow_name: string;
  run_at: string;
  items_in: number;
  items_skipped_junk: number;
  items_processed: number;
  errors: number;
  notes: string;
  items: { name: string; action: string; detail: string }[];
}

export interface JobRow {
  id: string;
  type: string;
  status: string;
  account_sfdc_id: string | null;
  created_at: string;
  created_by: string;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
  result: string | null;
  error: string | null;
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function fmt(iso: string | null): string {
  return iso ? `${new Date(iso).toLocaleString()} (${timeAgo(iso)})` : '—';
}

function durationLabel(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.round(secs / 60)}m ${secs % 60}s`;
}

// Splits "budget=30 processed=12 noData=3 signals=2" style notes into rows.
function noteParts(notes: string): [string, string][] {
  const parts = notes.split(/\s+/).filter((p) => p.includes('='));
  if (parts.length === 0) return [];
  return parts.map((p) => {
    const [k, ...rest] = p.split('=');
    return [k, rest.join('=')] as [string, string];
  });
}

function DetailRow({ label, value, bad }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className={bad ? 'detail-value bad' : 'detail-value'}>{value}</span>
    </div>
  );
}

export default function ActivityTables({ runs, jobs }: { runs: RunRow[]; jobs: JobRow[] }) {
  const [openRun, setOpenRun] = useState<RunRow | null>(null);
  const [openJob, setOpenJob] = useState<JobRow | null>(null);
  const close = () => {
    setOpenRun(null);
    setOpenJob(null);
  };

  return (
    <>
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
                  <tr key={j.id} className="row-click" onClick={() => setOpenJob(j)}>
                    <td>{j.type.replaceAll('_', ' ')}{j.account_sfdc_id ? ' (one account)' : ''}</td>
                    <td>
                      <span className={`badge ${j.status === 'failed' ? 'critical' : j.status === 'done' ? 'ok' : 'muted'}`}>
                        {j.status}
                      </span>
                    </td>
                    <td>{timeAgo(j.created_at)}</td>
                    <td>{j.finished_at ? timeAgo(j.finished_at) : '—'}</td>
                    <td className="notes-cell">{j.error ?? j.result ?? '—'}</td>
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
                  <tr key={r.id} className="row-click" onClick={() => setOpenRun(r)}>
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

      {openRun && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{openRun.workflow_name}</h2>
                <div className="meta">Run at {new Date(openRun.run_at).toLocaleString()}</div>
              </div>
              <div className="modal-head-actions">
                <button className="modal-close" onClick={close} aria-label="Close">✕</button>
              </div>
            </div>
            <div className="modal-body">
              <div className="detail-rows">
                <DetailRow label="Items in (candidates picked up)" value={openRun.items_in} />
                <DetailRow label="Items processed" value={openRun.items_processed} />
                <DetailRow label="Skipped as junk" value={openRun.items_skipped_junk} />
                <DetailRow label="Errors" value={openRun.errors} bad={openRun.errors > 0} />
                {noteParts(openRun.notes).map(([k, v]) => (
                  <DetailRow key={k} label={k} value={v} />
                ))}
              </div>
              {openRun.items.length > 0 && (
                <div className="detail-raw">
                  <h4>Per-item trace ({openRun.items.length})</h4>
                  <div className="history-list">
                    {openRun.items.map((i, idx) => (
                      <div className="history-item" key={idx}>
                        <span className={`history-action ${i.action.replace(/\s/g, '-')}`}>{i.action}</span>
                        <span className="history-name">{i.name}</span>
                        <span className="history-note">{i.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="detail-raw">
                <h4>Raw notes</h4>
                <pre>{openRun.notes || '—'}</pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {openJob && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{openJob.type.replaceAll('_', ' ')} job</h2>
                <div className="meta">
                  <span className={`badge ${openJob.status === 'failed' ? 'critical' : openJob.status === 'done' ? 'ok' : 'muted'}`}>
                    {openJob.status}
                  </span>
                </div>
              </div>
              <div className="modal-head-actions">
                <button className="modal-close" onClick={close} aria-label="Close">✕</button>
              </div>
            </div>
            <div className="modal-body">
              <div className="detail-rows">
                <DetailRow label="Scope" value={openJob.account_sfdc_id ? `single account (${openJob.account_sfdc_id})` : 'all accounts'} />
                <DetailRow label="Queued by" value={openJob.created_by} />
                <DetailRow label="Queued" value={fmt(openJob.created_at)} />
                <DetailRow label="Started" value={fmt(openJob.started_at)} />
                <DetailRow label="Finished" value={fmt(openJob.finished_at)} />
                <DetailRow label="Duration" value={durationLabel(openJob.started_at, openJob.finished_at)} />
                <DetailRow label="Attempts" value={openJob.attempts} />
              </div>
              {(openJob.result || openJob.error) && (
                <div className="detail-raw">
                  <h4>{openJob.error ? 'Error' : 'Result'}</h4>
                  <pre className={openJob.error ? 'bad' : ''}>{openJob.error ?? openJob.result}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
