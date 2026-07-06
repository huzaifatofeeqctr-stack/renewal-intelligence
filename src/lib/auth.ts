import { NextRequest, NextResponse } from 'next/server';

// Guards /api/cron/* and /api/enrich/*. Vercel Cron sends
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

export async function logRun(entry: {
  workflow_name: string;
  items_in: number;
  items_skipped_junk: number;
  items_processed: number;
  errors: number;
  notes: string;
}): Promise<void> {
  const { supabase } = await import('./supabase');
  const { error } = await supabase().from('enrichment_run_log').insert(entry);
  if (error) console.error('run log insert failed:', error.message);
}
