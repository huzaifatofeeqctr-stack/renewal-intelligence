import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { ContactDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ContactsPage() {
  await requireUser();
  let contacts: ContactDoc[] = [];
  let loadError: string | null = null;
  try {
    const c = await coll<ContactDoc>('contacts');
    contacts = await c.find({}).sort({ is_junk: 1, account_name: 1 }).limit(500).toArray();
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  return (
    <main>
      <h1>Contacts</h1>
      <p className="subtitle">Enrichment status, data quality flags, and provenance per contact.</p>
      {loadError ? (
        <div className="empty">Could not reach MongoDB ({loadError}).</div>
      ) : contacts.length === 0 ? (
        <div className="empty">No contacts yet — run /api/cron/sf-sync to pull them from Salesforce.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Account</th>
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
                <td>{c.account_name ?? '—'}</td>
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
                  {c.is_junk ? <span className="badge warning">{c.junk_reason}</span> : <span className="badge ok">clean</span>}
                </td>
                <td>
                  {c.clay_last_run
                    ? `${new Date(c.clay_last_run).toLocaleDateString()}${
                        c.work_email_provider ? ` (${c.work_email_provider})` : ''
                      }`
                    : 'never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
