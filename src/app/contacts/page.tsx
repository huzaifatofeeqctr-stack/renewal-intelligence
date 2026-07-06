import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface ContactWithAccount {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  title: string | null;
  email_valid: string;
  linkedin_url: string | null;
  is_junk: boolean;
  junk_reason: string | null;
  clay_last_run: string | null;
  work_email_provider: string | null;
  accounts: { name: string } | null;
}

export default async function ContactsPage() {
  let contacts: ContactWithAccount[] = [];
  let loadError: string | null = null;
  try {
    const { data, error } = await supabase()
      .from('contacts')
      .select(
        'id, first_name, last_name, email, title, email_valid, linkedin_url, is_junk, junk_reason, clay_last_run, work_email_provider, accounts(name)'
      )
      .order('is_junk', { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    contacts = (data ?? []) as unknown as ContactWithAccount[];
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  return (
    <main>
      <h1>Contacts</h1>
      <p className="subtitle">Enrichment status, data quality flags, and provenance per contact.</p>
      {loadError ? (
        <div className="empty">Could not reach Supabase ({loadError}).</div>
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
              <tr key={c.id}>
                <td>{`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '—'}</td>
                <td>{c.accounts?.name ?? '—'}</td>
                <td>{c.title ?? <span className="badge muted">missing</span>}</td>
                <td>{c.email ?? <span className="badge muted">missing</span>}</td>
                <td>
                  <span
                    className={`badge ${
                      c.email_valid === 'valid' ? 'ok' : c.email_valid === 'invalid' ? 'critical' : 'muted'
                    }`}
                  >
                    {c.email_valid}
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
