import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { coll } from '@/lib/db';
import { getSessionUser } from '@/lib/authn';

export const dynamic = 'force-dynamic';

// PATCH /api/signals/:id  { dismissed?: boolean, relevance?: 'helpful' | 'not_helpful' | 'inaccurate' }
// Powers the dashboard dismiss action and the feedback loop.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    dismissed?: boolean;
    relevance?: 'helpful' | 'not_helpful' | 'inaccurate';
  };

  const updates: Record<string, unknown> = {};
  if (typeof body.dismissed === 'boolean') {
    updates.dismissed = body.dismissed;
    updates.dismissed_at = body.dismissed ? new Date().toISOString() : null;
    updates.dismissed_by = body.dismissed ? user.email : null;
  }
  if (body.relevance && ['helpful', 'not_helpful', 'inaccurate'].includes(body.relevance)) {
    updates.relevance = body.relevance;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const signals = await coll('signals');
  const result = await signals.updateOne({ _id: new ObjectId(params.id) }, { $set: updates });
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
