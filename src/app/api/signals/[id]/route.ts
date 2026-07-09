import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { coll } from '@/lib/db';
import { getSessionUser } from '@/lib/authn';

export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'acknowledged', 'actioned', 'dismissed'] as const;

// PATCH /api/signals/:id
//   { status?: 'new' | 'acknowledged' | 'actioned' | 'dismissed',
//     dismissed?: boolean, relevance?: 'helpful' | 'not_helpful' | 'inaccurate' }
// Powers the inbox workflow and the feedback loop. `status` and the legacy
// `dismissed` boolean are kept in sync whichever one the caller sends.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!ObjectId.isValid(params.id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    dismissed?: boolean;
    status?: string;
    relevance?: 'helpful' | 'not_helpful' | 'inaccurate';
  };

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};
  if (typeof body.status === 'string' && (STATUSES as readonly string[]).includes(body.status)) {
    updates.status = body.status;
    updates.status_changed_at = now;
    updates.status_changed_by = user.email;
    updates.dismissed = body.status === 'dismissed';
    updates.dismissed_at = body.status === 'dismissed' ? now : null;
    updates.dismissed_by = body.status === 'dismissed' ? user.email : null;
  } else if (typeof body.dismissed === 'boolean') {
    updates.dismissed = body.dismissed;
    updates.dismissed_at = body.dismissed ? now : null;
    updates.dismissed_by = body.dismissed ? user.email : null;
    updates.status = body.dismissed ? 'dismissed' : 'new';
    updates.status_changed_at = now;
    updates.status_changed_by = user.email;
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
