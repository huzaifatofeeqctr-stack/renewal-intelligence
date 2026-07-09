import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/auth';
import { coll } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/dev/purge?confirm=1 — wipes accounts, contacts, signals, and
// notification history (run log is kept). Used when switching to the curated
// tracked-accounts model. Cron-secret protected + explicit confirm.
export async function POST(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (req.nextUrl.searchParams.get('confirm') !== '1') {
    return NextResponse.json({ error: 'add ?confirm=1 to really purge' }, { status: 400 });
  }

  // ?scope=signals wipes only signals + notification history (accounts and
  // contacts stay) — used after signal-quality fixes so alerts regenerate.
  if (req.nextUrl.searchParams.get('scope') === 'signals') {
    const [s, n] = await Promise.all([
      (await coll('signals')).deleteMany({}),
      (await coll('notification_log')).deleteMany({}),
    ]);
    return NextResponse.json({ purged: { signals: s.deletedCount, notifications: n.deletedCount } });
  }

  const [a, c, s, n] = await Promise.all([
    (await coll('accounts')).deleteMany({}),
    (await coll('contacts')).deleteMany({}),
    (await coll('signals')).deleteMany({}),
    (await coll('notification_log')).deleteMany({}),
  ]);

  return NextResponse.json({
    purged: {
      accounts: a.deletedCount,
      contacts: c.deletedCount,
      signals: s.deletedCount,
      notifications: n.deletedCount,
    },
  });
}
