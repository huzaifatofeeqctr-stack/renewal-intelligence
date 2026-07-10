import Link from 'next/link';
import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { ContactDoc } from '@/lib/types';
import { SearchBar, Pagination, parsePage, escapeRegex } from '../ListControls';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

// Sortable columns → the Mongo field each one orders by.
const SORTS: Record<string, string> = {
  name: 'last_name',
  account: 'account_name',
  title: 'title',
  email: 'email',
  validity: 'email_valid',
  linkedin: 'linkedin_url',
  quality: 'is_junk',
  enriched: 'enriched_at',
};

// Multi-select filters (AND-combined) → their Mongo conditions.
const FILTERS: Record<string, { label: string; group: string; cond: Record<string, unknown> }> = {
  valid_email: { label: 'valid email', group: 'Email', cond: { email_valid: 'valid' } },
  risky_email: { label: 'risky email', group: 'Email', cond: { email_valid: 'risky' } },
  missing_email: { label: 'missing email', group: 'Email', cond: { email: null } },
  has_linkedin: { label: 'has LinkedIn', group: 'LinkedIn', cond: { linkedin_url: { $nin: [null, ''] } } },
  no_linkedin: { label: 'no LinkedIn', group: 'LinkedIn', cond: { $or: [{ linkedin_url: null }, { linkedin_url: '' }] } },
  enriched: { label: 'enriched', group: 'Enrichment', cond: { enriched_at: { $ne: null } } },
  not_enriched: { label: 'never enriched', group: 'Enrichment', cond: { enriched_at: null } },
  missing_title: { label: 'missing title', group: 'Completeness', cond: { title: null } },
  complete: {
    label: 'fully complete',
    group: 'Completeness',
    cond: { email: { $ne: null }, title: { $ne: null }, linkedin_url: { $nin: [null, ''] } },
  },
  clean: { label: 'clean', group: 'Quality', cond: { is_junk: false } },
  junk: { label: 'junk-flagged', group: 'Quality', cond: { is_junk: true } },
};

function parseState(sp: { [key: string]: string | string[] | undefined }) {
  const sortKey = typeof sp.sort === 'string' && SORTS[sp.sort] ? sp.sort : 'account';
  const dir: 'asc' | 'desc' = sp.dir === 'desc' ? 'desc' : 'asc';
  const active = typeof sp.f === 'string' ? sp.f.split(',').filter((k) => FILTERS[k]) : [];
  const account = typeof sp.account === 'string' ? sp.account : '';
  return { sortKey, dir, active, account };
}

function buildHref(state: { q: string; sortKey: string; dir: string; active: string[]; account: string }): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.sortKey !== 'account' || state.dir !== 'asc') {
    params.set('sort', state.sortKey);
    params.set('dir', state.dir);
  }
  if (state.active.length) params.set('f', state.active.join(','));
  if (state.account) params.set('account', state.account);
  const qs = params.toString();
  return qs ? `/contacts?${qs}` : '/contacts';
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  await requireUser();
  const { q, page } = parsePage(searchParams);
  const { sortKey, dir, active, account } = parseState(searchParams);

  let contacts: ContactDoc[] = [];
  let total = 0;
  let accountNames: string[] = [];
  let loadError: string | null = null;
  try {
    const c = await coll<ContactDoc>('contacts');

    const clauses: Record<string, unknown>[] = [];
    if (q) {
      clauses.push({
        $or: [
          { first_name: { $regex: escapeRegex(q), $options: 'i' } },
          { last_name: { $regex: escapeRegex(q), $options: 'i' } },
          { email: { $regex: escapeRegex(q), $options: 'i' } },
          { title: { $regex: escapeRegex(q), $options: 'i' } },
          { account_name: { $regex: escapeRegex(q), $options: 'i' } },
        ],
      });
    }
    for (const key of active) clauses.push(FILTERS[key].cond);
    if (account) clauses.push({ account_name: account });
    const filter = clauses.length ? { $and: clauses } : {};

    const sortField = SORTS[sortKey];
    const sortSpec: Record<string, 1 | -1> = { [sortField]: dir === 'asc' ? 1 : -1 };
    if (sortField !== 'last_name') sortSpec.last_name = 1;

    [total, contacts, accountNames] = await Promise.all([
      c.countDocuments(filter),
      c.find(filter).sort(sortSpec).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).toArray(),
      c.distinct('account_name', { account_name: { $ne: null } }) as Promise<string[]>,
    ]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const state = { q, sortKey, dir, active, account };
  const keep: Record<string, string> = {
    ...(sortKey !== 'account' || dir !== 'asc' ? { sort: sortKey, dir } : {}),
    ...(active.length ? { f: active.join(',') } : {}),
    ...(account ? { account } : {}),
  };

  // Header link: click toggles asc/desc on the active column, sets asc on a new one.
  const sortHref = (key: string) =>
    buildHref({ ...state, sortKey: key, dir: sortKey === key && dir === 'asc' ? 'desc' : 'asc' });
  const arrow = (key: string) => (sortKey === key ? (dir === 'asc' ? ' ▲' : ' ▼') : '');

  const toggleFilter = (key: string) =>
    buildHref({
      ...state,
      // One selection per group (they contradict within a group); groups
      // AND together, so e.g. "valid email" + "has LinkedIn" combine.
      active: active.includes(key)
        ? active.filter((k) => k !== key)
        : [...active.filter((k) => FILTERS[k].group !== FILTERS[key].group), key],
    });

  const groups = [...new Set(Object.values(FILTERS).map((f) => f.group))];
  const hasAnyFilter = active.length > 0 || Boolean(account);

  return (
    <main>
      <h1>Contacts</h1>
      <p className="subtitle">Enrichment status, data quality flags, and provenance per contact.</p>
      <SearchBar basePath="/contacts" q={q} placeholder="Search by name, email, title, or account…" keep={keep} />

      <div className="filter-bar">
        {groups.map((group) => (
          <div className="filter-group" key={group}>
            <span className="filter-group-label">{group}</span>
            {Object.entries(FILTERS)
              .filter(([, f]) => f.group === group)
              .map(([key, f]) => (
                <Link
                  key={key}
                  href={toggleFilter(key)}
                  className={`chip${active.includes(key) ? ' active' : ''}`}
                >
                  {f.label}
                </Link>
              ))}
          </div>
        ))}
        {accountNames.length > 0 && accountNames.length <= 25 && (
          <div className="filter-group">
            <span className="filter-group-label">Account</span>
            {accountNames.sort().map((name) => (
              <Link
                key={name}
                href={buildHref({ ...state, account: account === name ? '' : name })}
                className={`chip${account === name ? ' active' : ''}`}
              >
                {name}
              </Link>
            ))}
          </div>
        )}
        {hasAnyFilter && (
          <Link href={buildHref({ q, sortKey, dir, active: [], account: '' })} className="chip clear-chip">
            ✕ clear filters
          </Link>
        )}
      </div>

      {loadError ? (
        <div className="empty">Could not reach MongoDB ({loadError}).</div>
      ) : contacts.length === 0 ? (
        <div className="empty">
          {q || hasAnyFilter
            ? 'No contacts match the current search/filters.'
            : 'No contacts yet — run /api/cron/sf-sync to pull them from Salesforce.'}
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th><Link href={sortHref('name')} className="th-sort">Name{arrow('name')}</Link></th>
                  <th><Link href={sortHref('account')} className="th-sort">Account{arrow('account')}</Link></th>
                  <th><Link href={sortHref('title')} className="th-sort">Title{arrow('title')}</Link></th>
                  <th><Link href={sortHref('email')} className="th-sort">Email{arrow('email')}</Link></th>
                  <th><Link href={sortHref('validity')} className="th-sort">Validity{arrow('validity')}</Link></th>
                  <th><Link href={sortHref('linkedin')} className="th-sort">LinkedIn{arrow('linkedin')}</Link></th>
                  <th><Link href={sortHref('quality')} className="th-sort">Quality{arrow('quality')}</Link></th>
                  <th><Link href={sortHref('enriched')} className="th-sort">Enriched{arrow('enriched')}</Link></th>
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
          </div>
          <Pagination basePath="/contacts" q={q} page={page} totalPages={totalPages} totalItems={total} keep={keep} />
        </>
      )}
    </main>
  );
}
