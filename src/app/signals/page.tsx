import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { SignalDoc } from '@/lib/types';
import SignalActions from './SignalActions';

export const dynamic = 'force-dynamic';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

type SignalWithId = SignalDoc & { _id: { toString(): string } };

export default async function SignalsPage() {
  await requireUser();
  let signals: SignalWithId[] = [];
  let loadError: string | null = null;
  try {
    const c = await coll<SignalDoc>('signals');
    signals = ((await c.find({}).sort({ detected_at: -1 }).limit(200).toArray()) as SignalWithId[]).sort(
      (a, b) =>
        Number(a.dismissed) - Number(b.dismissed) ||
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        b.detected_at.localeCompare(a.detected_at)
    );
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  return (
    <main>
      <h1>Signal Feed</h1>
      <p className="subtitle">
        Job changes, title changes, and new stakeholders — ranked by severity. Ratings feed the ICP tuning loop.
      </p>
      {loadError ? (
        <div className="empty">Could not reach MongoDB ({loadError}).</div>
      ) : signals.length === 0 ? (
        <div className="empty">No signals yet — they appear when the LeadIQ sync detects changes.</div>
      ) : (
        signals.map((s) => (
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
        ))
      )}
    </main>
  );
}
