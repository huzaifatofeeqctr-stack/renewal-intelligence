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
  signal_company_change_enabled: boolean;
  signal_company_change_severity: string;
  signal_title_change_enabled: boolean;
  signal_title_change_severity: string;
  signal_new_stakeholder_severity: string;
  title_equivalences: string;
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
const SEVERITIES = ['critical', 'warning', 'info'];

function hourLabel(h: number): string {
  const ampm = h < 12 ? 'AM' : 'PM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${ampm}`;
}

const SAMPLE: Record<string, string> = {
  contact: 'Sarah Kim',
  account: 'Glow Recipe',
  previous: 'VP Retention Marketing',
  new: 'SVP Lifecycle Marketing',
  owner: 'charlie.webber@postscript.io',
  date: 'Jul 9, 2026',
  summary: 'Sarah Kim changed title from VP Retention Marketing to SVP Lifecycle Marketing at Glow Recipe',
};

const EMOJI: Record<string, string> = {
  rotating_light: '🚨',
  warning: '⚠️',
  bust_in_silhouette: '👤',
  information_source: 'ℹ️',
  fire: '🔥',
  bell: '🔔',
  chart_with_upwards_trend: '📈',
  eyes: '👀',
  tada: '🎉',
};

function slackPreviewHtml(template: string): string {
  let t = template
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  for (const [k, v] of Object.entries(SAMPLE)) {
    t = t.replaceAll(`{${k}}`, v);
  }
  t = t.replace(/:([a-z0-9_+-]+):/g, (m, name: string) => EMOJI[name] ?? m);
  t = t.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
  t = t.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  return t.replace(/\n/g, '<br/>');
}


export default function WorkspacePanel({ initial, section }: { initial: Ws; section: string }) {
  const [ws, setWs] = useState<Ws>(initial);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingTpl, setEditingTpl] = useState<{ key: keyof Ws & string; label: string } | null>(null);
  const [draft, setDraft] = useState('');

  async function save(patch: Partial<Ws>) {
    setWs((prev) => ({ ...prev, ...patch }));
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/workspace-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      setWs((await res.json()) as Ws);
      setMessage({ kind: 'ok', text: 'Saved' });
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage({ kind: 'error', text: data.error ?? 'Save failed' });
    }
    setBusy(false);
  }

  const severitySelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} disabled={busy} onChange={(e) => onChange(e.target.value)}>
      {SEVERITIES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );

  return (
    <>
      {message && (
        <div className={message.kind === 'ok' ? 'form-ok floating-save' : 'form-error floating-save'}>
          {message.text}
        </div>
      )}

      {section === 'workspace' && (
      <div className="panel" id="workspace">
        <h2>Sync & enrichment</h2>
        <div className="settings-rows">
          <label className="setting-row">
            <span>
              <strong>Daily Salesforce sync</strong>
              <small>Refresh tracked accounts + contacts daily at the scheduled time</small>
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
              <small>Daily Apollo ICP-title scan, diffed against the CRM</small>
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
              <small>Apollo match credits spent per enrichment run</small>
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
              <small>Credits the discovery scan may spend on new people</small>
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
          <small>Comma-separated. Ratings on new-stakeholder signals tell you what to add/remove.</small>
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
      </div>
      )}

      {section === 'signal-rules' && (
      <div className="panel" id="signal-rules">
        <h2>Signal rules</h2>
        <p className="template-hint">
          What fires an alert. A <em>job change (new company)</em> fires only when Apollo&apos;s full employment
          history shows no current role at the account. A <em>title change</em> compares the CRM title against the
          person&apos;s title at the account, ignoring formatting variants (CMO ≡ Chief Marketing Officer,
          Co-Founder ≈ Founder). A <em>new stakeholder</em> is a person matching your ICP titles at the account&apos;s
          domain who isn&apos;t in the CRM.
        </p>
        <div className="settings-rows">
          <label className="setting-row">
            <span>
              <strong>Job change — new company</strong>
              <small>Contact no longer has any current role at the account</small>
            </span>
            <span className="schedule-pair">
              <input
                type="checkbox"
                checked={ws.signal_company_change_enabled}
                disabled={busy}
                onChange={(e) => save({ signal_company_change_enabled: e.target.checked })}
              />
              {severitySelect(ws.signal_company_change_severity, (v) => save({ signal_company_change_severity: v }))}
            </span>
          </label>
          <label className="setting-row">
            <span>
              <strong>Job change — new title</strong>
              <small>Title at the account genuinely differs from the CRM title</small>
            </span>
            <span className="schedule-pair">
              <input
                type="checkbox"
                checked={ws.signal_title_change_enabled}
                disabled={busy}
                onChange={(e) => save({ signal_title_change_enabled: e.target.checked })}
              />
              {severitySelect(ws.signal_title_change_severity, (v) => save({ signal_title_change_severity: v }))}
            </span>
          </label>
          <label className="setting-row">
            <span>
              <strong>New stakeholder</strong>
              <small>ICP-title match at the account with no CRM contact (toggle lives in Sync &amp; enrichment)</small>
            </span>
            {severitySelect(ws.signal_new_stakeholder_severity, (v) => save({ signal_new_stakeholder_severity: v }))}
          </label>
        </div>
        <div className="icp-block">
          <strong>Title equivalences (never signal)</strong>
          <small>One pair per line, e.g. <code>Head of Growth = VP Growth</code>. Case and punctuation are ignored.</small>
          <textarea
            defaultValue={ws.title_equivalences}
            rows={3}
            placeholder={'Head of Growth = VP Growth\nOwner = Founder'}
            onBlur={(e) => {
              if (e.target.value !== ws.title_equivalences) {
                save({ title_equivalences: e.target.value });
              }
            }}
          />
        </div>
      </div>
      )}

      {section === 'schedule' && (
      <div className="panel" id="schedule">
        <h2>Schedule</h2>
        <div className="settings-rows">
          <label className="setting-row">
            <span>
              <strong>Timezone</strong>
              <small>All schedule times are interpreted in this zone</small>
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
      </div>
      )}

      {section === 'slack-templates' && (
      <div className="panel" id="slack-templates">
        <h2>Slack alert templates</h2>
        <p className="template-hint">
          Placeholders: {'{contact} {account} {previous} {new} {owner} {date} {summary}'} — Slack markdown (*bold*,
          :emoji:) supported.
        </p>
        {(
          [
            ['slack_template_new_company', 'Job change — new company'],
            ['slack_template_new_title', 'Job change — new title'],
            ['slack_template_new_stakeholder', 'New stakeholder'],
          ] as const
        ).map(([key, label]) => (
          <div
            className="tpl-card"
            key={key}
            role="button"
            tabIndex={0}
            onClick={() => {
              setDraft(String(ws[key]));
              setEditingTpl({ key, label });
            }}
          >
            <div className="tpl-card-head">
              <strong>{label}</strong>
              <span className="badge muted">click to edit</span>
            </div>
            <div className="slack-preview" dangerouslySetInnerHTML={{ __html: slackPreviewHtml(String(ws[key])) }} />
          </div>
        ))}
      </div>
      )}

      {editingTpl && (
        <div className="modal-backdrop" onClick={() => setEditingTpl(null)}>
          <div className="modal tpl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{editingTpl.label}</h2>
                <div className="meta">Placeholders: {'{contact} {account} {previous} {new} {owner} {date} {summary}'}</div>
              </div>
              <div className="modal-head-actions">
                <button className="modal-close" onClick={() => setEditingTpl(null)} aria-label="Close">✕</button>
              </div>
            </div>
            <div className="modal-body tpl-editor">
              <div className="icp-block">
                <strong>Template</strong>
                <textarea value={draft} rows={8} onChange={(e) => setDraft(e.target.value)} autoFocus />
              </div>
              <div className="icp-block">
                <strong>Preview — how it will look in Slack</strong>
                <div className="slack-preview slack-preview-live">
                  <span className="slack-app">🔔 Renewal Intelligence <small>APP</small></span>
                  <div dangerouslySetInnerHTML={{ __html: slackPreviewHtml(draft) }} />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-clear" onClick={() => setEditingTpl(null)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={busy || !draft.trim()}
                onClick={async () => {
                  await save({ [editingTpl.key]: draft.trim() } as Partial<Ws>);
                  setEditingTpl(null);
                }}
              >
                Save template
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
