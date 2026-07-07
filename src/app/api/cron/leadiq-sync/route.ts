import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth, logRun } from '@/lib/auth';
import { coll } from '@/lib/db';
import { syncTrackedContacts, fetchChanges } from '@/lib/leadiq';
import { emitSignal } from '@/lib/signals';
import type { ContactDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Daily: sync non-junk contacts to LeadIQ champion tracking, poll for job/title
// changes since yesterday, and emit signals (store + SF Task + Slack).
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const contacts = await coll<ContactDoc>('contacts');
  const tracked = await contacts
    .find({ is_junk: false, email: { $ne: null } })
    .limit(1000)
    .toArray();

  await syncTrackedContacts(
    tracked.map((c) => ({
      sfdcId: c.sfdc_id,
      name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
      email: c.email ?? '',
      company: c.account_name ?? '',
    }))
  );

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const changes = await fetchChanges(since);

  const byId = new Map(tracked.map((c) => [c.sfdc_id, c]));
  const byEmail = new Map(tracked.map((c) => [c.email ?? '', c]));

  let emitted = 0;
  let errors = 0;
  for (const ch of changes) {
    const known = byId.get(ch.contactSfdcId) ?? byEmail.get(ch.email);
    const isCompany = ch.changeType === 'new_company';
    const contactName =
      ch.contactName || `${known?.first_name ?? ''} ${known?.last_name ?? ''}`.trim() || ch.email;
    const previousValue =
      ch.previousValue || (isCompany ? known?.account_name ?? '' : known?.title ?? '');
    try {
      const isNew = await emitSignal({
        signal_key: `${ch.contactSfdcId || ch.email}|job_change_${ch.changeType}|${ch.newValue}`,
        account_sfdc_id: known?.account_sfdc_id ?? undefined,
        contact_sfdc_id: ch.contactSfdcId || known?.sfdc_id,
        account_name: known?.account_name ?? '',
        contact_name: contactName,
        signal_type: isCompany ? 'job_change_new_company' : 'job_change_new_title',
        severity: isCompany ? 'critical' : 'warning',
        summary: isCompany
          ? `${contactName} left ${previousValue} and is now at ${ch.newValue}`
          : `${contactName} changed title from ${previousValue} to ${ch.newValue}`,
        previous_value: previousValue,
        new_value: ch.newValue,
        source: 'leadiq',
        csm_email: known?.account_owner_email ?? '',
        detected_at: ch.detectedAt,
      });
      if (isNew) emitted++;
    } catch (e) {
      errors++;
      console.error('signal emit failed:', e);
    }
  }

  await logRun({
    workflow_name: 'leadiq-sync',
    items_in: tracked.length,
    items_skipped_junk: 0,
    items_processed: changes.length,
    errors,
    notes: `tracked=${tracked.length} changes=${changes.length} newSignals=${emitted}`,
  });

  return NextResponse.json({ tracked: tracked.length, changes: changes.length, newSignals: emitted, errors });
}
