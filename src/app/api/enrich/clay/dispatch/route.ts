import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth, logRun } from '@/lib/auth';
import { coll } from '@/lib/db';
import { dispatchToClay } from '@/lib/clay';
import type { ContactDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

const BATCH_BUDGET = 100; // contacts per invocation — Clay credits are metered

// Manual trigger (POST with cron auth): sends incomplete, non-junk contacts to
// the Clay table webhook in renewal-priority order. Run one batch, review
// enrichment_run_log spend, run the next.
export async function POST(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const contacts = await coll<ContactDoc>('contacts');
  const cooldown = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const candidates = await contacts
    .find({
      is_junk: false,
      $and: [
        { $or: [{ email: null }, { title: null }, { linkedin_url: null }] },
        { $or: [{ clay_last_run: null }, { clay_last_run: { $lt: cooldown } }] },
      ],
    })
    .sort({ account_renewal_date: 1 })
    .limit(500)
    .toArray();

  const batch = candidates.slice(0, BATCH_BUDGET);
  let sent = 0;
  let errors = 0;
  for (const c of batch) {
    const ok = await dispatchToClay({
      contact_id: c.sfdc_id,
      first_name: c.first_name ?? '',
      last_name: c.last_name ?? '',
      email: c.email ?? '',
      title: c.title ?? '',
      company_name: c.account_name ?? '',
      company_domain: c.account_website ?? '',
    });
    if (ok) {
      sent++;
      await contacts.updateOne(
        { sfdc_id: c.sfdc_id },
        { $set: { clay_last_run: new Date().toISOString() } }
      );
    } else {
      errors++;
    }
  }

  await logRun({
    workflow_name: 'clay-dispatch',
    items_in: candidates.length,
    items_skipped_junk: 0,
    items_processed: sent,
    errors,
    notes: `budget=${BATCH_BUDGET} candidates=${candidates.length} sent=${sent}`,
  });

  return NextResponse.json({ candidates: candidates.length, sent, errors });
}
