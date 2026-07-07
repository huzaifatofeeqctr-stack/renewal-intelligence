import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth, logRun } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { dispatchToClay } from '@/lib/clay';

export const dynamic = 'force-dynamic';

const BATCH_BUDGET = 100; // contacts per invocation — Clay credits are metered

// Manual trigger (POST with cron auth): sends incomplete, non-junk contacts to
// the Clay table webhook in renewal-priority order. Run one batch, review
// enrichment_run_log spend, run the next.
export async function POST(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const db = supabase();
  const cooldown = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from('contacts')
    .select('sfdc_id, first_name, last_name, email, title, accounts(name, website, renewal_date)')
    .eq('is_junk', false)
    .or('email.is.null,title.is.null,linkedin_url.is.null')
    .or(`clay_last_run.is.null,clay_last_run.lt.${cooldown}`)
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type JoinedContact = {
    sfdc_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    title: string | null;
    accounts: { name: string; website: string | null; renewal_date: string | null } | null;
  };
  const candidates = ((data ?? []) as unknown as JoinedContact[])
    .sort((a, b) => (a.accounts?.renewal_date ?? '9999').localeCompare(b.accounts?.renewal_date ?? '9999'))
    .slice(0, BATCH_BUDGET);

  let sent = 0;
  let errors = 0;
  for (const c of candidates) {
    const ok = await dispatchToClay({
      contact_id: c.sfdc_id,
      first_name: c.first_name ?? '',
      last_name: c.last_name ?? '',
      email: c.email ?? '',
      title: c.title ?? '',
      company_name: c.accounts?.name ?? '',
      company_domain: c.accounts?.website ?? '',
    });
    if (ok) {
      sent++;
      await db
        .from('contacts')
        .update({ clay_last_run: new Date().toISOString() })
        .eq('sfdc_id', c.sfdc_id);
    } else {
      errors++;
    }
  }

  await logRun({
    workflow_name: 'clay-dispatch',
    items_in: (data ?? []).length,
    items_skipped_junk: 0,
    items_processed: sent,
    errors,
    notes: `budget=${BATCH_BUDGET} candidates=${(data ?? []).length} sent=${sent}`,
  });

  return NextResponse.json({ candidates: (data ?? []).length, sent, errors });
}
