import { NextRequest, NextResponse } from 'next/server';
import { coll } from '@/lib/db';
import { getSessionUser, isAdminRole, type UserDoc } from '@/lib/authn';
import { logUserAction } from '@/lib/user-audit';

export const dynamic = 'force-dynamic';

// GET: list workspace users (admin only) — powers the Team settings tab.
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) return NextResponse.json({ error: 'admin only' }, { status: 403 });

  const users = await coll<UserDoc>('users');
  const list = await users
    .find({})
    .project<Pick<UserDoc, 'email' | 'name' | 'role' | 'created_at'>>({
      email: 1,
      name: 1,
      role: 1,
      created_at: 1,
    })
    .sort({ created_at: 1 })
    .toArray();
  return NextResponse.json({ users: list.map((u) => ({ ...u, _id: undefined })) });
}

// PATCH { email, role } — promote/demote a user (admin only). Admins cannot
// change their own role, so a workspace can never lock itself out.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isAdminRole(user.role)) return NextResponse.json({ error: 'admin only' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { email?: string; role?: string };
  const email = (body.email ?? '').toLowerCase().trim();
  if (!email || (body.role !== 'admin' && body.role !== 'member')) {
    return NextResponse.json({ error: 'pass email and role (admin|member)' }, { status: 400 });
  }
  if (email === user.email) {
    return NextResponse.json({ error: 'you cannot change your own role' }, { status: 400 });
  }

  const users = await coll<UserDoc>('users');
  const target = await users.findOne({ email });
  if (!target) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  if (target.role === 'superadmin') {
    return NextResponse.json({ error: 'the superadmin role cannot be changed' }, { status: 400 });
  }
  const res = await users.updateOne(
    { email },
    { $set: { role: body.role, updated_at: new Date().toISOString() } }
  );
  if (res.matchedCount === 0) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  await logUserAction(user.email, 'user.role_change', `${email} -> ${body.role}`);
  return NextResponse.json({ ok: true, email, role: body.role });
}
