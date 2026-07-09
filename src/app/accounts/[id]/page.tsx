import Link from 'next/link';
import { notFound } from 'next/navigation';
import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { AccountDoc, ContactDoc, IndustryIntelDoc, SignalDoc } from '@/lib/types';
import SignalActions from '../../signals/SignalActions';

export const dynamic = 'force-dynamic';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

type SignalWithId = SignalDoc & { _id: { toString(): string } };

function scoreClass(score: number): string {
  if (score >= 80) return 'good';
  if (score >= 50) return 'mid';
  return 'bad';
}

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  await requireUser();

  const account = await (await coll<AccountDoc>('accounts')).findOne({ sfdc_id: params.id });
  if (!account) notFound();

  const [contacts, signals, intel] = await Promise.all([
    (await coll<ContactDoc>('contacts'))
      .find({ account_sfdc_id: account.sfdc_id })
      .sort({ is_junk: 1, last_name: 1 })
      .limit(200)
      .toArray(),
    (await coll<SignalDoc>('signals'))
      .find({ account_sfdc_id: account.sfdc_id })
      .sort({ dismissed: 1, detected_at: -1 })
      .limit(100)
      .toArray() as Promise<SignalWithId[]>,
    account.industry
      ? (await coll<IndustryIntelDoc>('industry_intel')).findOne({ industry: account.industry })
      : Promise.resolve(null),
  ]);

  const open = signals.filter((s) => !s.dismissed);
  const critical = open.filter((s) => s.severity === 'critical').length;
  const warning = open.filter((s) => s.severity === 'warning').length;
  const info = open.filter((s) => s.severity === 'info').length;
  const score = Math.max(0, 100 - critical * 40 - warning * 15 - info * 5);
  const sortedSignals = signals.sort(
    (a, b) =>
      Number(a.dismissed) - Number(b.dismissed) ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.detected_at.localeCompare(a.detected_at)
  );
  const cleanContacts = contacts.filter((c) => !c.is_junk);
  const junkContacts = contacts.filter((c) => c.is_junk);

  return (
    <main>
      <p className="breadcrumb">
        <Link href="/">← Accounts</Link>
      </p>
      <div className="detail-header">
        <div>
          <h1>{account.name}</h1>
          <p className="subtitle">
            {account.industry ?? 'No industry'}
            {account.website ? (
              <>
                {' · '}
                <a href={`https://${account.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer" className="link">
                  {account.website}
                </a>
              </>
            ) : null}
            {account.owner_email ? ` · owner ${account.owner_email}` : ' · unassigned'}
            {account.renewal_date ? ` · renews ${account.renewal_date}` : ''}
          </p>
        </div>
        <div className={`score-big ${scoreClass(score)}`}>
          {score}
          <small>health</small>
        </div>
      </div>

      <div className="badges" style={{ marginBottom: 24 }}>
        {critical > 0 && <span className="badge critical">{critical} critical</span>}
        {warning > 0 && <span className="badge warning">{warning} warning</span>}
        {info > 0 && <span className="badge info">{info} info</span>}
        {open.length === 0 && <span className="badge ok">healthy — no open signals</span>}
        <span className="badge muted">{cleanContacts.length} contacts</span>
        {junkContacts.length > 0 && <span className="badge muted">{junkContacts.length} junk-flagged</span>}
      </div>

      <h2 className="section-title">Signals</h2>
      {sortedSignals.length === 0 ? (
        <div className="empty">No signals for this account yet.</div>
      ) : (
        sortedSignals.map((s) => {
          const status = s.status ?? (s.dismissed ? 'dismissed' : 'new');
          return (
            <div className={`signal${status === 'dismissed' ? ' dismissed' : ''}`} key={s._id.toString()}>
              <span className={`dot ${s.severity}`} />
              <div className="body">
                <div className="summary">
                  {s.summary} <span className={`badge status-${status}`}>{status}</span>
                </div>
                <div className="detail">
                  {s.signal_type.replaceAll('_', ' ')} · {s.source} · {new Date(s.detected_at).toLocaleDateString()}
                </div>
              </div>
              <SignalActions id={s._id.toString()} status={status} relevance={s.relevance} />
            </div>
          );
        })
      )}

      <h2 className="section-title">Contacts</h2>
      {contacts.length === 0 ? (
        <div className="empty">No contacts synced for this account.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th>Email</th>
              <th>Validity</th>
              <th>LinkedIn</th>
              <th>Quality</th>
              <th>Enriched</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.sfdc_id}>
                <td>{`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '—'}</td>
                <td>{c.title ?? <span className="badge muted">missing</span>}</td>
                <td>{c.email ?? <span className="badge muted">missing</span>}</td>
                <td>
                  <span
                    className={`badge ${
                      c.email_valid === 'valid' ? 'ok' : c.email_valid === 'invalid' ? 'critical' : 'muted'
                    }`}
                  >
                    {c.email_valid ?? 'unknown'}
                  </span>
                </td>
                <td>
                  {c.linkedin_url ? (
                    <a href={c.linkedin_url} target="_blank" rel="noreferrer">
                      profile
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {c.is_junk ? (
                    <span className="badge warning">{c.junk_reason}</span>
                  ) : (
                    <span className="badge ok">clean</span>
                  )}
                </td>
                <td>{c.enriched_at ? new Date(c.enriched_at).toLocaleDateString() : 'never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {intel?.briefing_summary && (
        <>
          <h2 className="section-title">Industry Intel — {account.industry}</h2>
          <div className="briefing">
            <p>{intel.briefing_summary}</p>
            {Array.isArray(intel.sources) && intel.sources.length > 0 && (
              <div className="sources">
                {intel.sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer">
                    {s.title || s.url}
                  </a>
                ))}
              </div>
            )}
            {intel.generated_at && (
              <div className="sources">refreshed {new Date(intel.generated_at).toLocaleDateString()}</div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
