import { NextResponse } from 'next/server';
import { coll } from '@/lib/db';
import { getSessionUser } from '@/lib/authn';
import type { SignalDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET: aggregates 👎/inaccurate feedback into ICP-tuning insights — which
// stakeholder titles keep producing signals the team doesn't want.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const signals = await coll<SignalDoc>('signals');
  const rated = await signals
    .find({ relevance: { $in: ['not_helpful', 'inaccurate'] } })
    .project<Pick<SignalDoc, 'signal_type' | 'new_value' | 'relevance'>>({
      signal_type: 1,
      new_value: 1,
      relevance: 1,
    })
    .toArray();

  // For new_stakeholder signals, new_value is the person's title — the thing
  // the ICP list controls.
  const titleCounts = new Map<string, { title: string; not_helpful: number; inaccurate: number }>();
  let otherNegative = 0;
  for (const s of rated) {
    if (s.signal_type === 'new_stakeholder' && s.new_value) {
      const key = s.new_value.toLowerCase().trim();
      const entry = titleCounts.get(key) ?? { title: s.new_value, not_helpful: 0, inaccurate: 0 };
      if (s.relevance === 'inaccurate') entry.inaccurate++;
      else entry.not_helpful++;
      titleCounts.set(key, entry);
    } else {
      otherNegative++;
    }
  }

  const titles = [...titleCounts.values()].sort(
    (a, b) => b.not_helpful + b.inaccurate - (a.not_helpful + a.inaccurate)
  );

  return NextResponse.json({ titles, otherNegative, totalRated: rated.length });
}
