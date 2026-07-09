import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth, logRun } from '@/lib/auth';
import { coll } from '@/lib/db';
import { matchPerson, normalizeDomain } from '@/lib/apollo';
import { updateContact } from '@/lib/salesforce';
import { emitSignal } from '@/lib/signals';
import type { ContactDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MATCH_BUDGET = 30; // people/match calls per request — keeps each run under the proxy timeout
const PACE_MS = 1500; // Apollo caps people/match at 50/min — stay safely under

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST (cron auth): enriches incomplete, non-junk contacts via Apollo
// people/match in renewal-priority order. Fill-only-empty writeback to Mongo +
// Salesforce. Also detects job/title changes: when Apollo's current title or
// company disagrees with the CRM, a signal fires.
export async function POST(req: NextRequest) {
  try {
    return await run(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('apollo-enrich failed:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function run(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const contacts = await coll<ContactDoc>('contacts');
  const cooldown = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const candidates = await contacts
    .find({
      is_junk: false,
      first_name: { $ne: null },
      last_name: { $ne: null },
      $and: [
        { $or: [{ email: null }, { title: null }, { linkedin_url: null }] },
        { $or: [{ enriched_at: null }, { enriched_at: { $lt: cooldown } }] },
      ],
    })
    .sort({ account_renewal_date: 1 })
    .limit(MATCH_BUDGET)
    .toArray();

  const now = new Date().toISOString();
  let enrichedCount = 0;
  let noData = 0;
  let signals = 0;
  let errors = 0;
  let firstError: string | null = null;

  for (const c of candidates) {
    try {
      const accountDomain =
        normalizeDomain(c.account_website) || (c.email ? c.email.split('@')[1] ?? '' : '');
      const matchQuery = {
        firstName: c.first_name ?? undefined,
        lastName: c.last_name ?? undefined,
        domain: accountDomain || undefined,
        email: c.email ?? undefined,
      };
      let person;
      try {
        person = await matchPerson(matchQuery);
      } catch (e) {
        if (e instanceof Error && e.message.includes('429')) {
          await sleep(30000); // rate-limit window — wait and retry once
          person = await matchPerson(matchQuery);
        } else {
          throw e;
        }
      }
      await sleep(PACE_MS);

      const updates: Partial<ContactDoc> = {
        enriched_at: now,
        enrichment_provider: 'apollo',
        updated_at: now,
      };

      if (person) {
        const emailUsable = person.email && person.email_status === 'verified';
        if (emailUsable) updates.email_valid = 'valid';
        else if (person.email && person.email_status === 'guessed') updates.email_valid = 'risky';

        if (!c.email && emailUsable) {
          updates.email = person.email.toLowerCase();
          updates.work_email = person.email.toLowerCase();
        }
        if (!c.title && person.title) updates.title = person.title;
        if (!c.linkedin_url && person.linkedin_url) updates.linkedin_url = person.linkedin_url;

        // Champion tracking: does Apollo's current view disagree with the CRM?
        const contactName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
        if (
          person.org_domain &&
          accountDomain &&
          person.org_domain !== accountDomain &&
          !person.org_domain.endsWith(`.${accountDomain}`) &&
          !accountDomain.endsWith(`.${person.org_domain}`)
        ) {
          const isNew = await emitSignal({
            signal_key: `${c.sfdc_id}|job_change_new_company|${person.org_name}`,
            account_sfdc_id: c.account_sfdc_id ?? undefined,
            contact_sfdc_id: c.sfdc_id,
            account_name: c.account_name ?? '',
            contact_name: contactName,
            signal_type: 'job_change_new_company',
            severity: 'critical',
            summary: `${contactName} appears to have left ${c.account_name} — Apollo shows them at ${person.org_name}`,
            previous_value: c.account_name ?? '',
            new_value: person.org_name,
            source: 'apollo',
            csm_email: c.account_owner_email ?? '',
            detected_at: now,
          });
          if (isNew) signals++;
        } else if (
          c.title &&
          person.title &&
          c.title.toLowerCase().trim() !== person.title.toLowerCase().trim()
        ) {
          const isNew = await emitSignal({
            signal_key: `${c.sfdc_id}|job_change_new_title|${person.title}`,
            account_sfdc_id: c.account_sfdc_id ?? undefined,
            contact_sfdc_id: c.sfdc_id,
            account_name: c.account_name ?? '',
            contact_name: contactName,
            signal_type: 'job_change_new_title',
            severity: 'warning',
            summary: `${contactName} changed title from ${c.title} to ${person.title}`,
            previous_value: c.title,
            new_value: person.title,
            source: 'apollo',
            csm_email: c.account_owner_email ?? '',
            detected_at: now,
          });
          if (isNew) signals++;
        }

        enrichedCount++;
      } else {
        noData++;
      }

      await contacts.updateOne({ sfdc_id: c.sfdc_id }, { $set: updates });

      // Mirror filled blanks back to Salesforce (standard fields only).
      const sfFields: Record<string, string> = {};
      if (typeof updates.email === 'string') sfFields.Email = updates.email;
      if (typeof updates.title === 'string' && !c.title) sfFields.Title = updates.title;
      if (Object.keys(sfFields).length > 0) {
        await updateContact(c.sfdc_id, sfFields);
      }
    } catch (e) {
      errors++;
      if (!firstError) {
        firstError = `${c.sfdc_id}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
      }
      console.error(`apollo enrich failed for ${c.sfdc_id}:`, e);
    }
  }

  await logRun({
    workflow_name: 'apollo-enrich',
    items_in: candidates.length,
    items_skipped_junk: 0,
    items_processed: enrichedCount,
    errors,
    notes: `budget=${MATCH_BUDGET} enriched=${enrichedCount} noData=${noData} signals=${signals}`,
  });

  return NextResponse.json({ candidates: candidates.length, enriched: enrichedCount, noData, signals, errors, firstError });
}
