import { NextRequest, NextResponse } from 'next/server';
import { createUser, createSession } from '@/lib/authn';
import { isDuplicateKeyError } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    password?: string;
  };
  const email = (body.email ?? '').trim().toLowerCase();
  const name = (body.name ?? '').trim();
  const password = body.password ?? '';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }
  if (name.length < 2) {
    return NextResponse.json({ error: 'Enter your name' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  try {
    await createUser(email, name, password);
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 });
    }
    throw e;
  }

  await createSession(email);
  return NextResponse.json({ ok: true });
}
