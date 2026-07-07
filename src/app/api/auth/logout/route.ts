import { NextRequest, NextResponse } from 'next/server';
import { destroySession } from '@/lib/authn';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  await destroySession();
  return NextResponse.redirect(new URL('/login', req.url), 303);
}
