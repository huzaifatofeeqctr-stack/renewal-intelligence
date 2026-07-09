import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/authn';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  await destroySession();
  // Behind Railway's proxy req.url is the internal host (localhost:8080) —
  // rebuild the public origin from forwarded headers.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return NextResponse.redirect(`${proto}://${host}/login`, 303);
}
