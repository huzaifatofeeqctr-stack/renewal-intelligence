'use client';

import { useState } from 'react';

interface Ws {
  sf_sync_enabled: boolean;
  enrich_batch_size: number;
  enrich_cooldown_days: number;
  stakeholder_discovery_enabled: boolean;
  stakeholder_reveal_budget: number;
  stakeholder_accounts_per_run: number;
  icp_titles: string;
}

const JOBS = [
  { label: 'Sync Salesforce now', method: 'GET', path: '/api/cron/sf-sync?force=1' },
  { label: 'Run enrichment batch', method: 'POST', path: '/api/enrich/apollo' },
  { label: 'Discover stakeholders', method: 'GET', path: '/api/cron/apollo-stakeholders?force=1' },
  { label: 'Refresh industry intel', method: 'GET', path: '/api/cron/industry-intel' },
];

export default function WorkspacePanel({ initial }: { initial: Ws }) {
  const [ws, setWs] = useState<Ws>(initial);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  async function save(patch: Partial<Ws>) {
    const next = { ...ws, ...patch };
    setWs(next);
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/workspace-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setWs((await res.json()) as Ws);
      setMessage({ kind: 'ok', text: 'Workspace settings saved' });
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage({ kind: 'error', text: data.error ?? 'Save failed' });
    }
    setBusy(false);
  }

  async function runJob(job: (typeof JOBS)[number]) {
    setRunning(job.path);
    setRunResult(null);
    try {
      const res = await fetch(job.path, { method: job.method });
      const text = await res.text();
      setRunResult(`${job.label}: ${res.status} ${text.slice(0, 400)}`);
    } catch (e) {
      setRunResult(`${job.label}: ${e instanceof Error ? e.message : 'failed'}`);
    }
    setRunning(null);
  }

  return (
    <div className="panel">
      <h2>Workspace — sync & enrichment (admin)</h2>
      <div className="settings-rows">
        <label className="setting-row">
          <span>
            <strong>Daily Salesforce sync</strong>
            <small>Refresh tracked accounts + contacts on the daily schedule (5:00 UTC)</small>
          </span>
          <input
            type="checkbox"
            checked={ws.sf_sync_enabled}
            disabled={busy}
            onChange={(e) => save({ sf_sync_enabled: e.target.checked })}
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Stakeholder discovery</strong>
            <small>Daily Apollo ICP-title scan (7:00 UTC), diffed against the CRM</small>
          </span>
          <input
            type="checkbox"
            checked={ws.stakeholder_discovery_enabled}
            disabled={busy}
            onChange={(e) => save({ stakeholder_discovery_enabled: e.target.checked })}
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Enrichment batch size</strong>
            <small>Apollo match credits spent per enrichment run (5–100)</small>
          </span>
          <select
            value={ws.enrich_batch_size}
            disabled={busy}
            onChange={(e) => save({ enrich_batch_size: Number(e.target.value) })}
          >
            {[10, 20, 30, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>
            <strong>Re-enrichment cooldown</strong>
            <small>Days before a contact can be enriched again</small>
          </span>
          <select
            value={ws.enrich_cooldown_days}
            disabled={busy}
            onChange={(e) => save({ enrich_cooldown_days: Number(e.target.value) })}
          >
            {[30, 60, 90, 180].map((n) => (
              <option key={n} value={n}>{n} days</option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>
            <strong>Stakeholder reveals per run</strong>
            <small>Credits the daily discovery scan may spend on new people</small>
          </span>
          <select
            value={ws.stakeholder_reveal_budget}
            disabled={busy}
            onChange={(e) => save({ stakeholder_reveal_budget: Number(e.target.value) })}
          >
            {[5, 10, 25, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>
            <strong>Accounts scanned per run</strong>
            <small>Discovery rotates through the book at this pace</small>
          </span>
          <select
            value={ws.stakeholder_accounts_per_run}
            disabled={busy}
            onChange={(e) => save({ stakeholder_accounts_per_run: Number(e.target.value) })}
          >
            {[5, 10, 15, 25, 50].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="icp-block">
        <strong>ICP titles for stakeholder discovery</strong>
        <small>Comma-separated. Ratings on new-stakeholder signals tell you what to add/remove here.</small>
        <textarea
          defaultValue={ws.icp_titles}
          rows={3}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value.trim() !== ws.icp_titles) {
              save({ icp_titles: e.target.value.trim() });
            }
          }}
        />
      </div>

      <div className="run-now">
        <strong>Run now</strong>
        <div className="run-buttons">
          {JOBS.map((j) => (
            <button key={j.path} className="btn-secondary" disabled={running !== null} onClick={() => runJob(j)}>
              {running === j.path ? 'Running…' : j.label}
            </button>
          ))}
        </div>
        {runResult && <div className="form-ok run-result">{runResult}</div>}
      </div>

      {message && <div className={message.kind === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</div>}
    </div>
  );
}
