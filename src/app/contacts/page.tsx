import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { ContactDoc } from '@/lib/types';
import { SearchBar, Pagination, parsePage, escapeRegex } from '../ListControls';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  await requireUser();
  const { q, page } = parsePage(searchParams);

  let contacts: ContactDoc[] = [];
  let total = 0;
  let loadError: string | null = null;
  try {
    const c = await coll<ContactDoc>('contacts');
    const filter = q
      ? {
          $or: [
            { first_name: { $regex: escapeRegex(q), $options: 'i' } },
            { last_name: { $regex: escapeRegex(q), $options: 'i' } },
            { email: { $regex: escapeRegex(q), $options: 'i' } },
            { title: { $regex: escapeRegex(q), $options: 'i' } },
            { account_name: { $regex: escapeRegex(q), $options: 'i' } },
          ],
        }
      : {};
    total = await c.countDocuments(filter);
    contacts = await c
      .find(filter)
      .sort({ is_junk: 1, account_name: 1, last_name: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray();
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main>
      <h1>Contacts</h1>
      <p className="subtitle">Enrichment status, data quality flags, and provenance per contact.</p>
      <SearchBar basePath="/contacts" q={q} placeholder="Search by name, email, title, or account…" />
      {loadError ? (
        <div className="empty">Could not reach MongoDB ({loadError}).</div>
      ) : contacts.length === 0 ? (
        <div className="empty">
          {q ? `No contacts match “${q}”.` : 'No contacts yet — run /api/cron/sf-sync to pull them from Salesforce.'}
        </div>
      ) : (
        <>
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
                    {c.is_junk ? (
                      <span className="badge warning">{c.junk_reason}</span>
                    ) : (
                      <span className="badge ok">clean</span>
                    )}
                  </td>
                  <td>
                    {c.enriched_at
                      ? `${new Date(c.enriched_at).toLocaleDateString()}${
                          c.enrichment_provider ? ` (${c.enrichment_provider})` : ''
                        }`
                      : 'never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination basePath="/contacts" q={q} page={page} totalPages={totalPages} totalItems={total} />
        </>
      )}
    </main>
  );
}
