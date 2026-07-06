import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// PATCH /api/signals/:id  { dismissed?: boolean, relevance?: 'helpful' | 'not_helpful' | 'inaccurate' }
// Powers the dashboard dismiss action and the feedback loop.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = (await req.json().catch(() => ({}))) as {
    dismissed?: boolean;
    relevance?: 'helpful' | 'not_helpful' | 'inaccurate';
  };

  const updates: Record<string, unknown> = {};
  if (typeof body.dismissed === 'boolean') {
    updates.dismissed = body.dismissed;
    updates.dismissed_at = body.dismissed ? new Date().toISOString() : null;
  }
  if (body.relevance && ['helpful', 'not_helpful', 'inaccurate'].includes(body.relevance)) {
    updates.relevance = body.relevance;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { error } = await supabase().from('signals').update(updates).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
