import { supabase } from '@/lib/supabase';
import type { IndustryIntelRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function IndustryPage() {
  let briefings: IndustryIntelRow[] = [];
  let loadError: string | null = null;
  try {
    const { data, error } = await supabase()
      .from('industry_intel')
      .select('*')
      .order('industry', { ascending: true });
    if (error) throw new Error(error.message);
    briefings = (data ?? []) as IndustryIntelRow[];
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  return (
    <main>
      <h1>Industry Intel</h1>
      <p className="subtitle">Weekly Tavily + Anthropic briefings per account industry — always served from cache.</p>
      {loadError ? (
        <div className="empty">Could not reach Supabase ({loadError}).</div>
      ) : briefings.length === 0 ? (
        <div className="empty">No briefings yet — the weekly industry-intel cron populates this.</div>
      ) : (
        briefings.map((b) => (
          <div className="briefing" key={b.id}>
            <h3>
              {b.industry}{' '}
              {b.generated_at && (
                <span className="badge muted">refreshed {new Date(b.generated_at).toLocaleDateString()}</span>
              )}
            </h3>
            <p>{b.briefing_summary ?? 'No briefing generated.'}</p>
            {Array.isArray(b.sources) && b.sources.length > 0 && (
              <div className="sources">
                {b.sources.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer">
                    {s.title || s.url}
                  </a>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </main>
  );
}
