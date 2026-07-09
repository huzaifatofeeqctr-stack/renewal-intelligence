import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { IndustryIntelDoc } from '@/lib/types';
import IndustryGrid from './IndustryGrid';

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
      <p className="subtitle">Weekly Tavily + Anthropic briefings per account industry — click a card for the full briefing.</p>
      {loadError ? (
        <div className="empty">Could not reach MongoDB ({loadError}).</div>
      ) : briefings.length === 0 ? (
        <div className="empty">No briefings yet — the weekly industry-intel cron populates this.</div>
      ) : (
        <IndustryGrid
          briefings={briefings.map((b) => ({
            industry: b.industry,
            summary: b.briefing_summary ?? 'No briefing generated.',
            generated_at: b.generated_at,
            sources: Array.isArray(b.sources) ? b.sources.map((s) => ({ title: s.title, url: s.url })) : [],
          }))}
        />
      )}
    </main>
  );
}
