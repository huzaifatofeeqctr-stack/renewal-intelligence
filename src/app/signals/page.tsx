import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { SignalDoc } from '@/lib/types';
import SignalActions from './SignalActions';
import { SearchBar, Pagination, parsePage, escapeRegex } from '../ListControls';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

type SignalWithId = SignalDoc & { _id: { toString(): string } };

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  await requireUser();
  const { q, page } = parsePage(searchParams);

  let signals: SignalWithId[] = [];
  let total = 0;
  let loadError: string | null = null;
  try {
    const c = await coll<SignalDoc>('signals');
    const filter = q
      ? {
          $or: [
            { summary: { $regex: escapeRegex(q), $options: 'i' } },
            { account_name: { $regex: escapeRegex(q), $options: 'i' } },
            { contact_name: { $regex: escapeRegex(q), $options: 'i' } },
            { signal_type: { $regex: escapeRegex(q), $options: 'i' } },
            { severity: { $regex: escapeRegex(q), $options: 'i' } },
          ],
        }
      : {};
    total = await c.countDocuments(filter);
    const raw = (await c
      .find(filter)
      .sort({ dismissed: 1, detected_at: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .toArray()) as SignalWithId[];
    signals = raw.sort(
      (a, b) =>
        Number(a.dismissed) - Number(b.dismissed) ||
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        b.detected_at.localeCompare(a.detected_at)
    );
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main>
      <h1>Signal Feed</h1>
      <p className="subtitle">
        Job changes, title changes, and new stakeholders — ranked by severity. Ratings feed the ICP tuning loop.
      </p>
      <SearchBar basePath="/signals" q={q} placeholder="Search by account, contact, type, or severity…" />
      {loadError ? (
        <div className="empty">Could not reach MongoDB ({loadError}).</div>
      ) : signals.length === 0 ? (
        <div className="empty">
          {q ? `No signals match “${q}”.` : 'No signals yet — they appear when the LeadIQ sync detects changes.'}
        </div>
      ) : (
        <>
          {signals.map((s) => (
            <div className={`signal${s.dismissed ? ' dismissed' : ''}`} key={s._id.toString()}>
              <span className={`dot ${s.severity}`} />
              <div className="body">
                <div className="summary">{s.summary}</div>
                <div className="detail">
                  {s.account_name} · {s.signal_type.replaceAll('_', ' ')} · {s.source} ·{' '}
                  {new Date(s.detected_at).toLocaleDateString()}
                  {s.csm_email ? ` · owner ${s.csm_email}` : ''}
                  {s.sfdc_task_id ? ' · SF task created' : ''}
                </div>
              </div>
              <SignalActions id={s._id.toString()} dismissed={s.dismissed} relevance={s.relevance} />
            </div>
          ))}
          <Pagination basePath="/signals" q={q} page={page} totalPages={totalPages} totalItems={total} />
        </>
      )}
    </main>
  );
}
