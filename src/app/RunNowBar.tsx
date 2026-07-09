'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const JOBS = [
  { icon: '🔄', label: 'Sync Salesforce', method: 'GET', path: '/api/cron/sf-sync?force=1' },
  { icon: '⚡', label: 'Run enrichment', method: 'POST', path: '/api/enrich/apollo' },
  { icon: '🔍', label: 'Discover stakeholders', method: 'GET', path: '/api/cron/apollo-stakeholders?force=1' },
  { icon: '📰', label: 'Refresh industry intel', method: 'GET', path: '/api/cron/industry-intel' },
];

export default function RunNowBar() {
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
        {JOBS.map((j) => (
          <button
            key={j.path}
            className={`run-icon${running === j.path ? ' running' : ''}`}
            title={j.label}
            aria-label={j.label}
            disabled={running !== null}
            onClick={() => run(j)}
          >
            {running === j.path ? '⏳' : j.icon}
          </button>
        ))}
      </div>
      {result && (
        <div className="grid-toast run-bar-toast" onClick={() => setResult(null)}>
          {result}
        </div>
      )}
    </div>
  );
}
