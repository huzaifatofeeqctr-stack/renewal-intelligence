'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
  phase: 'running' | 'done' | 'error';
  rows: [string, string][];
  message: string | null;
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
      <rect width="64" height="64" rx="14" fill="#171a21" />
      <g fill="none" stroke="#5b9dd9" strokeWidth="4" strokeLinecap="round">
        <path className="pulse-arc a1" d="M18 44a14 14 0 0 1 14-14" />
        <path className="pulse-arc a2" d="M10 44a22 22 0 0 1 22-22" />
        <path className="pulse-arc a3" d="M2.5 44a29.5 29.5 0 0 1 29.5-29.5" transform="translate(4 0) scale(0.93)" />
      </g>
      <circle cx="20" cy="44" r="5" fill="#f0546c" />
      <circle cx="44" cy="24" r="5" fill="#4cb782" />
    </svg>
  );
}

export default function RunNowBar({ lastEnrichRunAt }: { lastEnrichRunAt?: string | null }) {
  const router = useRouter();
  const [run, setRun] = useState<RunState | null>(null);

  async function start(job: Job) {
    setRun({ job, phase: 'running', rows: [], message: null });
    try {
      const res = await fetch(job.path, { method: job.method });
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
    if (run?.phase !== 'running') setRun(null);
  };

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
              disabled={run?.phase === 'running'}
              onClick={() => start(j)}
            >
              {run?.job.path === j.path && run.phase === 'running' ? '⏳' : j.icon}
            </button>
          );
        })}
      </div>

      {run && (
        <div className={`run-overlay${run.phase === 'running' ? ' busy' : ''}`} onClick={dismiss}>
          <div className="run-card" onClick={(e) => e.stopPropagation()}>
            {run.phase === 'running' ? (
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
