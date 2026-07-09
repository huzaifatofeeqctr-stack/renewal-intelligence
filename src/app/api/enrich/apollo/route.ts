import { NextRequest, NextResponse } from 'next/server';
import { requireCronOrAdmin, logRun } from '@/lib/auth';
import { getWorkspaceSettings } from '@/lib/workspace';
import { coll } from '@/lib/db';
import { matchPerson, normalizeDomain, currentRoleAtAccount, titlesEquivalent } from '@/lib/apollo';
import { emitSignal } from '@/lib/signals';
import type { ContactDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MATCH_BUDGET = 30; // people/match calls per request — keeps each run under the proxy timeout
const PACE_MS = 1500; // Apollo caps people/match at 50/min — stay safely under

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// POST (cron auth): enriches incomplete, non-junk contacts via Apollo
// people/match in renewal-priority order. Fill-only-empty into Mongo (Salesforce
// is never written). Also detects job/title changes: when Apollo's current title or
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
  const denied = await requireCronOrAdmin(req);
  if (denied) return denied;

  const settings = await getWorkspaceSettings();
  const batchSize = Math.min(MATCH_BUDGET, settings.enrich_batch_size);
  const contacts = await coll<ContactDoc>('contacts');
  const cooldown = new Date(Date.now() - settings.enrich_cooldown_days * 24 * 60 * 60 * 1000).toISOString();

  // Optional ?account=<sfdc_id> scopes the run to one account (card/popup button).
  const accountScope = req.nextUrl.searchParams.get('account');
  const candidates = await contacts
    .find({
      is_junk: false,
      first_name: { $ne: null },
      last_name: { $ne: null },
      ...(accountScope ? { account_sfdc_id: accountScope } : {}),
      $and: [
        { $or: [{ email: null }, { title: null }, { linkedin_url: null }] },
        { $or: [{ enriched_at: null }, { enriched_at: { $lt: cooldown } }] },
      ],
    })
    .sort({ account_renewal_date: 1 })
    .limit(batchSize)
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
        if (!c.linkedin_url && person.linkedin_url) updates.linkedin_url = person.linkedin_url;

        // Champion tracking, normalized against the FULL employment history:
        // a concurrent role elsewhere (advisor, second venture) must not read
        // as "left the company". Only signal when the person has no current
        // role at the account at all.
        const contactName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
        const roleAtAccount = currentRoleAtAccount(person, accountDomain, c.account_name ?? '');
        const hasAnyCurrentRole = person.employment.some((e) => e.current) || Boolean(person.org_name);

        if (!roleAtAccount && hasAnyCurrentRole && person.org_name) {
          const isNew = await emitSignal({
            signal_key: `${c.sfdc_id}|job_change_new_company|${person.org_name}`,
            account_sfdc_id: c.account_sfdc_id ?? undefined,
            contact_sfdc_id: c.sfdc_id,
            account_name: c.account_name ?? '',
            contact_name: contactName,
            signal_type: 'job_change_new_company',
            severity: 'critical',
            summary: `${contactName} appears to have left ${c.account_name} — Apollo shows them at ${person.org_name} with no current role at ${c.account_name}`,
            previous_value: c.account_name ?? '',
            new_value: person.org_name,
            source: 'apollo',
            csm_email: c.account_owner_email ?? '',
            detected_at: now,
          });
          if (isNew) signals++;
        } else {
          // Compare titles from their role AT the account (not the primary org),
          // with normalization so formatting variants don't signal.
          const titleAtAccount = roleAtAccount?.title || person.title;
          if (!c.title && titleAtAccount) updates.title = titleAtAccount;
          if (c.title && titleAtAccount && !titlesEquivalent(c.title, titleAtAccount)) {
            const isNew = await emitSignal({
              signal_key: `${c.sfdc_id}|job_change_new_title|${titleAtAccount}`,
              account_sfdc_id: c.account_sfdc_id ?? undefined,
              contact_sfdc_id: c.sfdc_id,
              account_name: c.account_name ?? '',
              contact_name: contactName,
              signal_type: 'job_change_new_title',
              severity: 'warning',
              summary: `${contactName} changed title from ${c.title} to ${titleAtAccount} at ${c.account_name}`,
              previous_value: c.title,
              new_value: titleAtAccount,
              source: 'apollo',
              csm_email: c.account_owner_email ?? '',
              detected_at: now,
            });
            if (isNew) signals++;
          }
        }

        enrichedCount++;
      } else {
        noData++;
      }

      // Salesforce is read-only for this app — enriched data lives in Mongo only.
      await contacts.updateOne({ sfdc_id: c.sfdc_id }, { $set: updates });
    } catch (e) {
      errors++;
      const message = e instanceof Error ? e.message : String(e);
      if (!firstError) {
        firstError = `${c.sfdc_id}: ${message}`.slice(0, 500);
      }
      console.error(`apollo enrich failed for ${c.sfdc_id}:`, e);
      if (message.includes('insufficient credits')) break; // plan is out of credits — no point continuing
    }
  }

  await logRun({
    workflow_name: 'apollo-enrich',
    items_in: candidates.length,
    items_skipped_junk: 0,
    items_processed: enrichedCount,
    errors,
    notes: `budget=${batchSize} enriched=${enrichedCount} noData=${noData} signals=${signals}`,
  });

  return NextResponse.json({ candidates: candidates.length, enriched: enrichedCount, noData, signals, errors, firstError });
}
