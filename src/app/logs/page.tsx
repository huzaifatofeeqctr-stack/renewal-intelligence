import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { UserAuditDoc } from '@/lib/user-audit';
import { SearchBar, Pagination, parsePage, escapeRegex } from '../ListControls';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const ACTION_CLASS: Record<string, string> = {
  'auth.login': 'ok',
  'auth.signup': 'ok',
  'auth.logout': 'muted',
  'settings.update': 'info',
  'user.role_change': 'warning',
  'account.untrack': 'critical',
  'account.import': 'info',
  'enrich.run': 'info',
  'signal.update': 'muted',
};

// Superadmin-only: the per-user action audit trail.
export default async function UserLogsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const user = await requireUser();
  if (user.role !== 'superadmin') {
    return (
      <main>
        <h1>User logs</h1>
        <div className="empty">Restricted — only the superadmin can view user activity logs.</div>
      </main>
    );
  }

  const { q, page } = parsePage(searchParams);
  let entries: (UserAuditDoc & { _id: { toString(): string } })[] = [];
  let total = 0;
  let loadError: string | null = null;
  try {
    const c = await coll<UserAuditDoc>('user_audit_log');
    const filter = q
      ? {
          $or: [
            { user_email: { $regex: escapeRegex(q), $options: 'i' } },
            { action: { $regex: escapeRegex(q), $options: 'i' } },
            { details: { $regex: escapeRegex(q), $options: 'i' } },
          ],
        }
      : {};
    total = await c.countDocuments(filter);
    entries = (await c
      .find(filter)
      .sort({ at: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray()) as typeof entries;
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main>
      <h1>User logs</h1>
      <p className="subtitle">Who did what, when — logins, settings changes, runs, imports, and signal actions.</p>
      <SearchBar basePath="/logs" q={q} placeholder="Filter by user, action, or detail…" />
      {loadError ? (
        <div className="empty">Could not reach MongoDB ({loadError}).</div>
      ) : entries.length === 0 ? (
        <div className="empty">{q ? 'No log entries match.' : 'No user activity recorded yet.'}</div>
      ) : (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e._id.toString()}>
                    <td title={new Date(e.at).toLocaleString()}>{timeAgo(e.at)}</td>
                    <td>{e.user_email}</td>
                    <td>
                      <span className={`badge ${ACTION_CLASS[e.action] ?? 'muted'}`}>{e.action}</span>
                    </td>
                    <td className="notes-cell">{e.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination basePath="/logs" q={q} page={page} totalPages={totalPages} totalItems={total} />
        </>
      )}
    </main>
  );
}
