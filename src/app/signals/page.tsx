import { supabase } from '@/lib/supabase';
import type { SignalRow } from '@/lib/types';
import SignalActions from './SignalActions';

export const dynamic = 'force-dynamic';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export default async function SignalsPage() {
  let signals: SignalRow[] = [];
  let loadError: string | null = null;
  try {
    const { data, error } = await supabase()
      .from('signals')
      .select('*')
      .order('detected_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    signals = ((data ?? []) as SignalRow[]).sort(
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
        <div className="empty">Could not reach Supabase ({loadError}).</div>
      ) : signals.length === 0 ? (
        <div className="empty">No signals yet — they appear when the LeadIQ sync detects changes.</div>
      ) : (
        signals.map((s) => (
          <div className={`signal${s.dismissed ? ' dismissed' : ''}`} key={s.id}>
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
            <SignalActions id={s.id} dismissed={s.dismissed} relevance={s.relevance} />
          </div>
        ))
      )}
    </main>
  );
}
