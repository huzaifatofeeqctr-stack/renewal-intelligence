'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export interface AccountCardData {
  sfdc_id: string;
  name: string;
  industry: string | null;
  owner_email: string | null;
  renewal_date: string | null;
  website: string | null;
  critical: number;
  warning: number;
  info: number;
  computedScore: number;
  enriched_at: string | null; // most recent contact enrichment on the account
}

interface SignalRow {
  _id: string;
  signal_type: string;
  severity: 'critical' | 'warning' | 'info';
  summary: string;
  source: string;
  detected_at: string;
  dismissed: boolean;
  relevance: string | null;
  sfdc_task_id: string | null;
}

interface ContactRow {
  sfdc_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  title: string | null;
  email_valid: string;
  linkedin_url: string | null;
  is_junk: boolean;
  junk_reason: string | null;
}

interface HistoryEntry {
  id: string;
  workflow_name: string;
  run_at: string;
  errors: number;
  notes: string;
  items: { name: string; action: string; detail: string }[];
}

interface Detail {
  account: AccountCardData & { website: string | null; last_enriched_at?: string | null };
  signals: SignalRow[];
  contacts: ContactRow[];
  history?: HistoryEntry[];
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const WORKFLOW_LABELS: Record<string, string> = {
  'sf-sync': '🔄 Salesforce sync',
  'sf-import': '📥 Imported from Salesforce',
  'apollo-enrich': '⚡ Apollo enrichment',
  'champion-watch': '👁 Champion watch',
  'apollo-stakeholders': '🔍 Stakeholder discovery',
};

function scoreClass(score: number): string {
  if (score >= 80) return 'good';
  if (score >= 50) return 'mid';
  return 'bad';
}

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';

export default function AccountsGrid({ accounts }: { accounts: AccountCardData[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<SeverityFilter>('all');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  async function open(id: string, preset: SeverityFilter = 'all') {
    setOpenId(id);
    setFilter(preset);
    setSearch('');
    setConfirmDelete(false);
    setExpandedRun(null);
    setDetail(null);
    setLoading(true);
    const res = await fetch(`/api/accounts/${id}`);
    if (res.ok) setDetail((await res.json()) as Detail);
    setLoading(false);
  }

  function close() {
    setOpenId(null);
    setDetail(null);
    setConfirmDelete(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function patchSignal(id: string, body: Record<string, unknown>) {
    await fetch(`/api/signals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setDetail((d) =>
      d
        ? {
            ...d,
            signals: d.signals.map((s) =>
              s._id === id
                ? {
                    ...s,
                    dismissed: typeof body.dismissed === 'boolean' ? (body.dismissed as boolean) : s.dismissed,
                    relevance: typeof body.relevance === 'string' ? (body.relevance as string) : s.relevance,
                  }
                : s
            ),
          }
        : d
    );
    router.refresh();
  }

  async function untrackAccount() {
    if (!openId) return;
    setBusy(true);
    const res = await fetch(`/api/accounts/${openId}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      close();
      router.refresh();
    }
  }

  async function enrichAccount(id: string, name: string) {
    setEnrichingId(id);
    setToast(`Enriching ${name}…`);
    try {
      const res = await fetch(`/api/enrich/apollo?account=${id}`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        candidates?: number;
        enriched?: number;
        signals?: number;
        errors?: number;
        firstError?: string | null;
        error?: string;
      };
      if (res.ok) {
        setToast(
          data.candidates === 0
            ? `${name}: nothing to enrich — all contacts are complete or on cooldown.`
            : `${name}: enriched ${data.enriched}/${data.candidates}, ${data.signals ?? 0} signal(s)${
                data.errors ? `, ${data.errors} error(s)` : ''
              }${data.firstError?.includes('insufficient credits') ? ' — Apollo is out of credits' : ''}`
        );
        router.refresh();
      } else {
        setToast(`${name}: ${data.error ?? 'enrichment failed'}`);
      }
    } catch {
      setToast(`${name}: enrichment request failed`);
    }
    setEnrichingId(null);
  }

  async function untrackFromCard(id: string, name: string) {
    if (!window.confirm(`Untrack ${name}? Removes it and its contacts/signals from the workspace (Salesforce is untouched).`)) return;
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setToast(`${name} untracked.`);
      router.refresh();
    }
  }

  const q = search.toLowerCase().trim();
  const visibleSignals = (detail?.signals ?? []).filter(
    (s) =>
      (filter === 'all' || s.severity === filter) &&
      (!q || s.summary.toLowerCase().includes(q) || s.signal_type.includes(q))
  );
  const visibleContacts = (detail?.contacts ?? []).filter(
    (c) =>
      !q ||
      `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.title ?? '').toLowerCase().includes(q)
  );
  const openAccount = accounts.find((a) => a.sfdc_id === openId);

  return (
    <>
      {toast && (
        <div className="grid-toast" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
      <div className="grid">
        {accounts.map((a) => (
          <div className="card card-link" key={a.sfdc_id} onClick={() => open(a.sfdc_id)} role="button" tabIndex={0}>
            <span className={`score ${scoreClass(a.computedScore)}`}>{a.computedScore}</span>
            <h3>{a.name}</h3>
            <div className="meta">
              {a.industry ?? 'No industry'} · {a.owner_email ?? 'unassigned'}
              {a.renewal_date ? ` · renews ${a.renewal_date}` : ''}
            </div>
            <div className="badges">
              {a.critical > 0 && (
                <span
                  className="badge critical clickable"
                  onClick={(e) => {
                    e.stopPropagation();
                    open(a.sfdc_id, 'critical');
                  }}
                >
                  {a.critical} critical
                </span>
              )}
              {a.warning > 0 && (
                <span
                  className="badge warning clickable"
                  onClick={(e) => {
                    e.stopPropagation();
                    open(a.sfdc_id, 'warning');
                  }}
                >
                  {a.warning} warning
                </span>
              )}
              {a.info > 0 && (
                <span
                  className="badge info clickable"
                  onClick={(e) => {
                    e.stopPropagation();
                    open(a.sfdc_id, 'info');
                  }}
                >
                  {a.info} info
                </span>
              )}
              {a.critical + a.warning + a.info === 0 && <span className="badge ok">healthy</span>}
            </div>
            <div className="card-actions">
              <button
                className={`card-btn${a.enriched_at ? ' done' : ''}`}
                disabled={enrichingId !== null}
                title={
                  a.enriched_at
                    ? `Enriched ${timeAgo(a.enriched_at)} (${new Date(a.enriched_at).toLocaleString()}) — click to run again`
                    : "Enrich this account's contacts via Apollo"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  enrichAccount(a.sfdc_id, a.name);
                }}
              >
                {enrichingId === a.sfdc_id ? 'Enriching…' : a.enriched_at ? '⚡ Enriched' : '⚡ Enrich'}
              </button>
              <button
                className="card-btn danger"
                title="Untrack this account"
                onClick={(e) => {
                  e.stopPropagation();
                  untrackFromCard(a.sfdc_id, a.name);
                }}
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>

      {openId && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{openAccount?.name ?? detail?.account.name ?? '…'}</h2>
                <div className="meta">
                  {openAccount?.industry ?? 'No industry'} · {openAccount?.owner_email ?? 'unassigned'}
                </div>
              </div>
              <div className="modal-head-actions">
                <Link href={`/accounts/${openId}`} className="btn-clear">
                  Full page ↗
                </Link>
                <button className="modal-close" onClick={close} aria-label="Close">
                  ✕
                </button>
              </div>
            </div>

            <div className="modal-toolbar">
              <input
                type="search"
                className="search-input"
                placeholder="Search signals & contacts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="chips">
                {(['all', 'critical', 'warning', 'info'] as SeverityFilter[]).map((f) => (
                  <button
                    key={f}
                    className={`chip ${f}${filter === f ? ' active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-body">
              {loading ? (
                <div className="empty">Loading…</div>
              ) : (
                <>
                  <h3 className="section-title">Signals ({visibleSignals.length})</h3>
                  {visibleSignals.length === 0 ? (
                    <div className="empty">No {filter !== 'all' ? filter : ''} signals{q ? ` matching “${search}”` : ''}.</div>
                  ) : (
                    visibleSignals.map((s) => (
                      <div className={`signal${s.dismissed ? ' dismissed' : ''}`} key={s._id}>
                        <span className={`dot ${s.severity}`} />
                        <div className="body">
                          <div className="summary">{s.summary}</div>
                          <div className="detail">
                            {s.signal_type.replaceAll('_', ' ')} · {s.source} ·{' '}
                            {new Date(s.detected_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="actions">
                          <button
                            className={s.relevance === 'helpful' ? 'active' : ''}
                            onClick={() => patchSignal(s._id, { relevance: 'helpful' })}
                          >
                            👍
                          </button>
                          <button
                            className={s.relevance === 'not_helpful' ? 'active' : ''}
                            onClick={() => patchSignal(s._id, { relevance: 'not_helpful' })}
                          >
                            👎
                          </button>
                          <button onClick={() => patchSignal(s._id, { dismissed: !s.dismissed })}>
                            {s.dismissed ? 'Restore' : 'Dismiss'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  <h3 className="section-title">Contacts ({visibleContacts.length})</h3>
                  {visibleContacts.length === 0 ? (
                    <div className="empty">No contacts{q ? ` matching “${search}”` : ''}.</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Title</th>
                          <th>Email</th>
                          <th>Quality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleContacts.map((c) => (
                          <tr key={c.sfdc_id}>
                            <td>
                              {`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '—'}
                              {c.linkedin_url && (
                                <>
                                  {' '}
                                  <a href={c.linkedin_url} target="_blank" rel="noreferrer" className="link">
                                    in↗
                                  </a>
                                </>
                              )}
                            </td>
                            <td>{c.title ?? <span className="badge muted">missing</span>}</td>
                            <td>{c.email ?? <span className="badge muted">missing</span>}</td>
                            <td>
                              {c.is_junk ? (
                                <span className="badge warning">{c.junk_reason}</span>
                              ) : (
                                <span className={`badge ${c.email_valid === 'valid' ? 'ok' : 'muted'}`}>
                                  {c.email_valid === 'valid' ? 'valid email' : 'clean'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  <h3 className="section-title">History ({(detail?.history ?? []).length})</h3>
                  {(detail?.history ?? []).length === 0 ? (
                    <div className="empty">No runs have touched this account yet.</div>
                  ) : (
                    <div className="history-list">
                      {(detail?.history ?? []).map((h) => (
                        <div className="history-entry" key={h.id}>
                          <button
                            className="history-head"
                            onClick={() => setExpandedRun(expandedRun === h.id ? null : h.id)}
                          >
                            <span className="history-title">
                              {WORKFLOW_LABELS[h.workflow_name] ?? h.workflow_name}
                              {h.errors > 0 && <span className="badge critical">{h.errors} error(s)</span>}
                            </span>
                            <span className="history-when" title={new Date(h.run_at).toLocaleString()}>
                              {timeAgo(h.run_at)} {expandedRun === h.id ? '▾' : '▸'}
                            </span>
                          </button>
                          {expandedRun === h.id && (
                            <div className="history-detail">
                              <div className="history-meta">
                                {new Date(h.run_at).toLocaleString()} · {h.notes}
                              </div>
                              {h.items.length === 0 ? (
                                <div className="history-meta">No per-item trace recorded for this run.</div>
                              ) : (
                                h.items.map((i, idx) => (
                                  <div className="history-item" key={idx}>
                                    <span className={`history-action ${i.action.replace(/\s/g, '-')}`}>{i.action}</span>
                                    <span className="history-name">{i.name}</span>
                                    <span className="history-note">{i.detail}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="modal-foot">
              {toast && <span className="modal-toast">{toast}</span>}
              {confirmDelete ? (
                <span className="delete-confirm">
                  Remove this account and its contacts/signals from the workspace? (Salesforce is untouched)
                  <button className="btn-danger" disabled={busy} onClick={untrackAccount}>
                    {busy ? 'Removing…' : 'Yes, untrack'}
                  </button>
                  <button className="btn-clear" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <>
                  <button
                    className={`btn-secondary${openAccount?.enriched_at ? ' done' : ''}`}
                    disabled={enrichingId !== null}
                    title={
                      openAccount?.enriched_at
                        ? `Enriched ${timeAgo(openAccount.enriched_at)} (${new Date(openAccount.enriched_at).toLocaleString()}) — click to run again`
                        : "Enrich this account's contacts via Apollo"
                    }
                    onClick={() => openAccount && enrichAccount(openAccount.sfdc_id, openAccount.name)}
                  >
                    {enrichingId === openId ? 'Enriching…' : openAccount?.enriched_at ? '⚡ Enriched — run again' : '⚡ Enrich account'}
                  </button>
                  <button className="btn-delete" onClick={() => setConfirmDelete(true)} title="Untrack this account">
                    🗑 Untrack
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
