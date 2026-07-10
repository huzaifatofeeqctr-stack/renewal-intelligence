'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const JOBS = [
  {
    icon: '🔄',
    label: 'Salesforce sync',
    verb: 'Syncing Salesforce…',
    tip: 'Sync Salesforce — refresh tracked accounts & contacts from the CRM',
    method: 'GET',
    path: '/api/cron/sf-sync?force=1',
  },
  {
    icon: '⚡',
    label: 'Enrichment',
    verb: 'Enriching contacts via Apollo…',
    tip: 'Run enrichment — fill missing emails/titles/LinkedIn via Apollo (uses credits)',
    method: 'POST',
    path: '/api/enrich/apollo',
  },
  {
    icon: '🔍',
    label: 'Stakeholder discovery',
    verb: 'Scanning accounts for new stakeholders…',
    tip: 'Discover stakeholders — scan accounts for ICP-title people not in the CRM',
    method: 'GET',
    path: '/api/cron/apollo-stakeholders?force=1',
  },
  {
    icon: '📰',
    label: 'Industry intel',
    verb: 'Refreshing industry briefings…',
    tip: 'Refresh industry intel — regenerate per-industry briefings (Tavily + AI)',
    method: 'GET',
    path: '/api/cron/industry-intel',
  },
];

type Job = (typeof JOBS)[number];

interface RunState {
  job: Job;
  phase: 'preview' | 'confirm' | 'running' | 'done' | 'error';
  rows: [string, string][];
  message: string | null;
  preview?: {
    incomplete: { candidates: number; accounts: number };
    everything: { candidates: number; accounts: number };
    per_request_cap: number;
  };
}

const KEY_LABELS: Record<string, string> = {
  candidates: 'Contacts picked up',
  enriched: 'Contacts enriched',
  noData: 'No Apollo match',
  signals: 'Signals emitted',
  errors: 'Errors',
  queuedFollowUp: 'Follow-up job queued',
  tracked: 'Accounts refreshed',
  accounts: 'Accounts',
  contacts: 'Contacts pulled',
  junk: 'Junk-flagged',
  reveals: 'People revealed',
  newStakeholders: 'New stakeholders',
  industries: 'Industries',
  refreshed: 'Briefings refreshed',
  skipped: 'Skipped',
  reason: 'Reason',
  note: 'Note',
  firstError: 'First error',
};

// Flattens a run's JSON response into readable label/value rows.
function toRows(data: Record<string, unknown>): [string, string][] {
  return Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .map(([k, v]) => [KEY_LABELS[k] ?? k, typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v)]);
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function PulseLogo() {
  return (
    <svg viewBox="0 0 64 64" className="run-logo" aria-hidden="true">
      <defs>
        <linearGradient id="runLogoBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c2230" />
          <stop offset="1" stopColor="#12151c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#runLogoBg)" />
      <g fill="none" stroke="#5b9dd9" strokeWidth="5" strokeLinecap="round">
        <path className="pulse-arc a1" d="M20 32 A12 12 0 0 1 32 44" />
        <path className="pulse-arc a2" d="M20 23 A21 21 0 0 1 41 44" />
        <path className="pulse-arc a3" d="M20 14 A30 30 0 0 1 50 44" />
      </g>
      <circle cx="20" cy="44" r="6" fill="#e8ecf3" />
      <circle cx="41.2" cy="22.8" r="4.5" fill="#4cb782" />
    </svg>
  );
}

export default function RunNowBar({ lastEnrichRunAt }: { lastEnrichRunAt?: string | null }) {
  const router = useRouter();
  const [run, setRun] = useState<RunState | null>(null);

  // The global enrichment button confirms first: total accounts + expected
  // Apollo credit spend, then runs the FULL backlog (ignores the batch budget;
  // overflow drains via background jobs).
  async function confirmEnrich(job: Job) {
    setRun({ job, phase: 'preview', rows: [], message: null });
    try {
      const res = await fetch('/api/enrich/apollo', { method: 'GET' });
      const data = (await res.json()) as {
        incomplete?: { candidates: number; accounts: number };
        everything?: { candidates: number; accounts: number };
        per_request_cap?: number;
        error?: string;
      };
      if (!res.ok || !data.incomplete || !data.everything) {
        setRun({ job, phase: 'error', rows: [], message: data.error ?? 'could not load the enrichment preview' });
        return;
      }
      setRun({
        job,
        phase: 'confirm',
        rows: [],
        message: null,
        preview: {
          incomplete: data.incomplete,
          everything: data.everything,
          per_request_cap: data.per_request_cap ?? 30,
        },
      });
    } catch (e) {
      setRun({ job, phase: 'error', rows: [], message: e instanceof Error ? e.message : 'request failed' });
    }
  }

  async function start(job: Job, path = job.path) {
    setRun({ job, phase: 'running', rows: [], message: null });
    try {
      const res = await fetch(path, { method: job.method });
      const text = await res.text();
      let data: Record<string, unknown> | null = null;
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // non-JSON response — show raw text
      }
      if (res.ok && data) {
        setRun({ job, phase: 'done', rows: toRows(data), message: null });
        router.refresh();
      } else {
        setRun({
          job,
          phase: 'error',
          rows: data ? toRows(data) : [],
          message: (data?.error as string) ?? text.slice(0, 300),
        });
      }
    } catch (e) {
      setRun({ job, phase: 'error', rows: [], message: e instanceof Error ? e.message : 'request failed' });
    }
  }

  const dismiss = () => {
    if (run?.phase !== 'running' && run?.phase !== 'preview') setRun(null);
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && run && run.phase !== 'running' && run.phase !== 'preview') setRun(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  return (
    <div className="run-bar">
      <div className="run-icons">
        {JOBS.map((j) => {
          const isEnrich = j.path === '/api/enrich/apollo';
          const done = isEnrich && Boolean(lastEnrichRunAt);
          const tip = done
            ? `${j.tip} — last ran ${timeAgo(lastEnrichRunAt!)} (${new Date(lastEnrichRunAt!).toLocaleString()})`
            : j.tip;
          return (
            <button
              key={j.path}
              className={`run-icon${run?.job.path === j.path && run.phase === 'running' ? ' running' : ''}${done ? ' done' : ''}`}
              data-tip={tip}
              aria-label={j.label}
              disabled={run !== null && run.phase !== 'done' && run.phase !== 'error'}
              onClick={() => (isEnrich ? confirmEnrich(j) : start(j))}
            >
              {run?.job.path === j.path && run.phase === 'running' ? '⏳' : j.icon}
            </button>
          );
        })}
      </div>

      {run && (
        <div className={`run-overlay${run.phase === 'running' || run.phase === 'preview' ? ' busy' : ''}`} onClick={dismiss}>
          <div className="run-card" onClick={(e) => e.stopPropagation()}>
            {run.phase === 'preview' ? (
              <>
                <PulseLogo />
                <h3>Checking what&apos;s enrichable…</h3>
                <div className="run-dots" aria-hidden="true">
                  <span /><span /><span />
                </div>
              </>
            ) : run.phase === 'confirm' && run.preview ? (
              <>
                <div className="run-result-icon confirm">⚡</div>
                <h3>Run enrichment</h3>
                <p className="run-hint">
                  Each contact costs ~1 Apollo credit. Both options run the full backlog — the first{' '}
                  {run.preview.per_request_cap} now, the rest via background jobs.
                </p>

                <button
                  className="enrich-option"
                  disabled={run.preview.incomplete.candidates === 0}
                  onClick={() => start(run.job, '/api/enrich/apollo?all=1')}
                >
                  <span className="enrich-option-head">
                    <strong>Enrich incomplete contacts</strong>
                    <span className="badge info">~{run.preview.incomplete.candidates} credits</span>
                  </span>
                  <small>
                    {run.preview.incomplete.candidates} contact{run.preview.incomplete.candidates === 1 ? '' : 's'} missing an
                    email, title, or LinkedIn across {run.preview.incomplete.accounts} account
                    {run.preview.incomplete.accounts === 1 ? '' : 's'}.
                  </small>
                </button>

                <button
                  className="enrich-option"
                  disabled={run.preview.everything.candidates === 0}
                  onClick={() => start(run.job, '/api/enrich/apollo?all=1&scope=everything')}
                >
                  <span className="enrich-option-head">
                    <strong>Re-enrich everything</strong>
                    <span className="badge warning">~{run.preview.everything.candidates} credits</span>
                  </span>
                  <small>
                    Every named contact — {run.preview.everything.candidates} across {run.preview.everything.accounts} account
                    {run.preview.everything.accounts === 1 ? '' : 's'} — including already-complete ones, to catch job
                    and title changes.
                  </small>
                </button>

                <div className="run-confirm-actions">
                  <button className="btn-clear" onClick={() => setRun(null)}>Cancel</button>
                </div>
              </>
            ) : run.phase === 'running' ? (
              <>
                <PulseLogo />
                <h3>{run.job.verb}</h3>
                <p className="run-hint">This can take a minute — budgets and rate limits are respected.</p>
                <div className="run-dots" aria-hidden="true">
                  <span /><span /><span />
                </div>
              </>
            ) : (
              <>
                <div className={`run-result-icon ${run.phase}`}>{run.phase === 'done' ? '✓' : '✕'}</div>
                <h3>
                  {run.job.label} {run.phase === 'done' ? 'complete' : 'failed'}
                </h3>
                {run.message && <p className="run-error">{run.message}</p>}
                {run.rows.length > 0 && (
                  <div className="detail-rows run-rows">
                    {run.rows.map(([k, v]) => (
                      <div className="detail-row" key={k}>
                        <span className="detail-label">{k}</span>
                        <span className={`detail-value${k === 'Errors' && v !== '0' ? ' bad' : ''}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="run-hint">Click anywhere to close</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
