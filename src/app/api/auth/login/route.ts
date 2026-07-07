import { NextRequest, NextResponse } from 'next/server';
import { authenticate, createSession } from '@/lib/authn';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const user = await authenticate(body.email ?? '', body.password ?? '');
  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  await createSession(user.email);
  return NextResponse.json({ ok: true });
}
