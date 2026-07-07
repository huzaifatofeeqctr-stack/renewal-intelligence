import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, verifyPassword, hashPassword, UserDoc, DEFAULT_SETTINGS } from '@/lib/authn';
import { coll } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(user);
}

// PATCH /api/me
// { name? } | { settings? } | { current_password, new_password }
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    settings?: Partial<UserDoc['settings']>;
    current_password?: string;
    new_password?: string;
  };

  const users = await coll<UserDoc>('users');
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.name === 'string') {
    if (body.name.trim().length < 2) {
      return NextResponse.json({ error: 'Name is too short' }, { status: 400 });
    }
    updates.name = body.name.trim();
  }

  if (body.settings && typeof body.settings === 'object') {
    const s = body.settings;
    const merged = { ...DEFAULT_SETTINGS, ...user.settings };
    if (typeof s.email_alerts === 'boolean') merged.email_alerts = s.email_alerts;
    if (typeof s.weekly_digest === 'boolean') merged.weekly_digest = s.weekly_digest;
    if (s.default_view && ['accounts', 'signals', 'contacts'].includes(s.default_view)) {
      merged.default_view = s.default_view;
    }
    updates.settings = merged;
  }

  if (body.new_password) {
    if (body.new_password.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
    }
    const full = await users.findOne({ email: user.email });
    if (!full || !verifyPassword(body.current_password ?? '', full.password_hash)) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 403 });
    }
    updates.password_hash = hashPassword(body.new_password);
  }

  await users.updateOne({ email: user.email }, { $set: updates });
  return NextResponse.json({ ok: true });
}
