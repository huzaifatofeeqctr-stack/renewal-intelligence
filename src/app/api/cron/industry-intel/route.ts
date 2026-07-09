import { NextRequest, NextResponse } from 'next/server';
import { requireCronOrAdmin, logRun } from '@/lib/auth';
import { coll } from '@/lib/db';
import { tavilySearch } from '@/lib/tavily';
import { summarize } from '@/lib/anthropic';
import type { IndustryIntelDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT =
  'You are a customer success intelligence assistant. Summarize the industry news ' +
  'into a 4-5 sentence briefing a CSM can use before a renewal conversation. Be ' +
  'specific, cite data where present, and flag any headwinds. Output only the briefing text.';

// Weekly: one Tavily search + Anthropic briefing per distinct account industry.
export async function GET(req: NextRequest) {
  try {
    return await run(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('industry-intel failed:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function run(req: NextRequest) {
  const denied = await requireCronOrAdmin(req);
  if (denied) return denied;

  const accounts = await coll('accounts');
  const intel = await coll<IndustryIntelDoc>('industry_intel');

  const industries = (await accounts.distinct('industry', { industry: { $ne: null } })) as string[];
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
  let processed = 0;
  let errors = 0;

  for (const industry of industries) {
    const query = `${industry} industry trends challenges consumer spending outlook ${new Date().getFullYear()}`;
    try {
      const search = await tavilySearch(query);
      if (search.results.length === 0) continue;

      const prompt = [
        `Industry: ${industry}`,
        '',
        'Web search results:',
        ...search.results.map((r) => `- ${r.title}: ${r.content.slice(0, 400)} [${r.url}]`),
        '',
        `Tavily answer: ${search.answer || 'n/a'}`,
      ].join('\n');
      const briefing = await summarize(SYSTEM_PROMPT, prompt);

      await intel.updateOne(
        { industry },
        {
          $set: {
            briefing_summary: briefing,
            sources: search.results.map((r) => ({ title: r.title, url: r.url })),
            tavily_query: query,
            model_used: model,
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        { upsert: true }
      );
      processed++;
    } catch (e) {
      // One industry failing must not block the rest; the previous briefing stays.
      errors++;
      console.error(`industry intel failed for ${industry}:`, e);
    }
  }

  await logRun({
    workflow_name: 'industry-intel',
    items_in: industries.length,
    items_skipped_junk: 0,
    items_processed: processed,
    errors,
    notes: 'weekly industry intel refresh',
  });

  return NextResponse.json({ industries: industries.length, refreshed: processed, errors });
}
