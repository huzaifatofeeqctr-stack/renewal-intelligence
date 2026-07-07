import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { IndustryIntelDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function IndustryPage() {
  await requireUser();
  let briefings: IndustryIntelDoc[] = [];
  let loadError: string | null = null;
  try {
    const c = await coll<IndustryIntelDoc>('industry_intel');
    briefings = await c.find({}).sort({ industry: 1 }).toArray();
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  return (
    <main>
      <h1>Industry Intel</h1>
      <p className="subtitle">Weekly Tavily + Anthropic briefings per account industry — always served from cache.</p>
      {loadError ? (
        <div className="empty">Could not reach MongoDB ({loadError}).</div>
      ) : briefings.length === 0 ? (
        <div className="empty">No briefings yet — the weekly industry-intel cron populates this.</div>
      ) : (
        briefings.map((b) => (
          <div className="briefing" key={b.industry}>
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
