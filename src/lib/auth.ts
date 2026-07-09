import { NextRequest, NextResponse } from 'next/server';

// Guards /api/cron/* and /api/enrich/*. The cron runner sends
// Authorization: Bearer <CRON_SECRET>; manual calls can use the same header
// or ?secret=.
export function requireCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  const header = req.headers.get('authorization');
  const query = req.nextUrl.searchParams.get('secret');
  if (header === `Bearer ${secret}` || query === secret) return null;
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

// Allows the Railway cron runner (secret) OR a signed-in admin (so the
// Settings page "Run now" buttons work).
export async function requireCronOrAdmin(req: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  const query = req.nextUrl.searchParams.get('secret');
  if (secret && (header === `Bearer ${secret}` || query === secret)) return null;
  const { getSessionUser } = await import('./authn');
  const user = await getSessionUser();
  if (user?.role === 'admin') return null;
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function logRun(entry: {
  workflow_name: string;
  items_in: number;
  items_skipped_junk: number;
  items_processed: number;
  errors: number;
  notes: string;
}): Promise<void> {
  try {
    const { coll } = await import('./db');
    const runLog = await coll('enrichment_run_log');
    await runLog.insertOne({ ...entry, run_at: new Date().toISOString() });
  } catch (e) {
    console.error('run log insert failed:', e);
  }
  if (entry.errors > 0) {
    const { notifyOps } = await import('./slack');
    await notifyOps(`*${entry.workflow_name}* finished with ${entry.errors} error(s).\n${entry.notes}`);
  }
}
