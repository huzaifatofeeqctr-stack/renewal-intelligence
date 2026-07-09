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
  timezone: string;
  sf_sync_hour: number;
  stakeholder_hour: number;
  industry_intel_day: number;
  industry_intel_hour: number;
  slack_template_new_company: string;
  slack_template_new_title: string;
  slack_template_new_stakeholder: string;
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Australia/Sydney',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number): string {
  const ampm = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${ampm}`;
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
            <small>Refresh tracked accounts + contacts daily at the scheduled time below</small>
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
            <small>Daily Apollo ICP-title scan at the scheduled time below, diffed against the CRM</small>
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

      <h2 style={{ marginTop: 22 }}>Schedule</h2>
      <div className="settings-rows">
        <label className="setting-row">
          <span>
            <strong>Timezone</strong>
            <small>All schedule times below are interpreted in this zone</small>
          </span>
          <select value={ws.timezone} disabled={busy} onChange={(e) => save({ timezone: e.target.value })}>
            {!TIMEZONES.includes(ws.timezone) && <option value={ws.timezone}>{ws.timezone}</option>}
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>
            <strong>Salesforce sync time</strong>
            <small>Daily refresh of tracked accounts</small>
          </span>
          <select value={ws.sf_sync_hour} disabled={busy} onChange={(e) => save({ sf_sync_hour: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>
            <strong>Stakeholder discovery time</strong>
            <small>Daily Apollo ICP scan</small>
          </span>
          <select value={ws.stakeholder_hour} disabled={busy} onChange={(e) => save({ stakeholder_hour: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>
            <strong>Industry intel refresh</strong>
            <small>Weekly Tavily + Anthropic briefings</small>
          </span>
          <span className="schedule-pair">
            <select value={ws.industry_intel_day} disabled={busy} onChange={(e) => save({ industry_intel_day: Number(e.target.value) })}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
            <select value={ws.industry_intel_hour} disabled={busy} onChange={(e) => save({ industry_intel_hour: Number(e.target.value) })}>
              {HOURS.map((h) => (
                <option key={h} value={h}>{hourLabel(h)}</option>
              ))}
            </select>
          </span>
        </label>
      </div>

      <h2 style={{ marginTop: 22 }}>Slack alert templates</h2>
      <p className="template-hint">
        Placeholders: {'{contact} {account} {previous} {new} {owner} {date} {summary}'} — Slack markdown (*bold*, :emoji:) supported.
      </p>
      {(
        [
          ['slack_template_new_company', 'Job change — new company (critical)'],
          ['slack_template_new_title', 'Job change — new title (warning)'],
          ['slack_template_new_stakeholder', 'New stakeholder (warning)'],
        ] as const
      ).map(([key, label]) => (
        <div className="icp-block" key={key}>
          <strong>{label}</strong>
          <textarea
            defaultValue={ws[key]}
            rows={4}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value.trim() !== ws[key]) {
                save({ [key]: e.target.value.trim() } as Partial<Ws>);
              }
            }}
          />
        </div>
      ))}

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
