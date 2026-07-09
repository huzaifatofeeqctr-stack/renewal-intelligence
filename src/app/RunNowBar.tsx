'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const JOBS = [
  {
    icon: '🔄',
    label: 'Sync Salesforce',
    tip: 'Sync Salesforce — refresh tracked accounts & contacts from the CRM',
    method: 'GET',
    path: '/api/cron/sf-sync?force=1',
  },
  {
    icon: '⚡',
    label: 'Run enrichment',
    tip: 'Run enrichment — fill missing emails/titles/LinkedIn via Apollo (uses credits)',
    method: 'POST',
    path: '/api/enrich/apollo',
  },
  {
    icon: '🔍',
    label: 'Discover stakeholders',
    tip: 'Discover stakeholders — scan accounts for ICP-title people not in the CRM',
    method: 'GET',
    path: '/api/cron/apollo-stakeholders?force=1',
  },
  {
    icon: '📰',
    label: 'Refresh industry intel',
    tip: 'Refresh industry intel — regenerate per-industry briefings (Tavily + AI)',
    method: 'GET',
    path: '/api/cron/industry-intel',
  },
];

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function RunNowBar({ lastEnrichRunAt }: { lastEnrichRunAt?: string | null }) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function run(job: (typeof JOBS)[number]) {
    setRunning(job.path);
    setResult(`${job.label} running…`);
    try {
      const res = await fetch(job.path, { method: job.method });
      const text = await res.text();
      setResult(`${job.label}: ${res.status === 200 ? '' : `${res.status} `}${text.slice(0, 300)}`);
      router.refresh();
    } catch (e) {
      setResult(`${job.label}: ${e instanceof Error ? e.message : 'failed'}`);
    }
    setRunning(null);
  }

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
              className={`run-icon${running === j.path ? ' running' : ''}${done ? ' done' : ''}`}
              data-tip={tip}
              aria-label={j.label}
              disabled={running !== null}
              onClick={() => run(j)}
            >
              {running === j.path ? '⏳' : j.icon}
            </button>
          );
        })}
      </div>
      {result && (
        <div className="grid-toast run-bar-toast" onClick={() => setResult(null)}>
          {result}
        </div>
      )}
    </div>
  );
}
