import { logRun } from './auth';
import { coll } from './db';
import { matchPerson, normalizeDomain, currentRoleAtAccount, titlesEquivalent, apolloPaceMs } from './apollo';
import { emitSignal } from './signals';
import { enqueueJob } from './jobs';
import { getWorkspaceSettings } from './workspace';
import type { ContactDoc } from './types';

const MATCH_BUDGET = 30; // per invocation — keeps a single HTTP run under the proxy timeout

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EnrichResult {
  candidates: number;
  enriched: number;
  noData: number;
  signals: number;
  errors: number;
  firstError: string | null;
  queuedFollowUp: boolean;
}

// The shared Apollo engine behind three callers:
//  - mode 'enrich': fill missing emails/titles/LinkedIn on incomplete contacts
//  - mode 'watch': champion watch — re-verify already-complete contacts on a
//    cadence so job changes surface even when nothing is missing in the CRM
// Both detect job/title changes against the FULL employment history (a
// concurrent role elsewhere must not read as "left the company") and write to
// Mongo only — Salesforce is never written.
export async function runEnrichBatch(opts: {
  mode: 'enrich' | 'watch';
  accountScope?: string | null;
  createdBy?: string;
}): Promise<EnrichResult> {
  const settings = await getWorkspaceSettings();
  const contacts = await coll<ContactDoc>('contacts');
  const isWatch = opts.mode === 'watch';
  const batchSize = Math.min(MATCH_BUDGET, isWatch ? settings.champion_watch_budget : settings.enrich_batch_size);
  const cooldown = new Date(Date.now() - settings.enrich_cooldown_days * 24 * 60 * 60 * 1000).toISOString();
  const watchCutoff = new Date(
    Date.now() - settings.champion_watch_cadence_days * 24 * 60 * 60 * 1000
  ).toISOString();

  const candidates = await contacts
    .find({
      is_junk: false,
      first_name: { $ne: null },
      last_name: { $ne: null },
      ...(opts.accountScope ? { account_sfdc_id: opts.accountScope } : {}),
      ...(isWatch
        ? {
            // watch: contacts we've already enriched, due for a re-check
            enriched_at: { $ne: null },
            $or: [{ watch_checked_at: null }, { watch_checked_at: { $lt: watchCutoff } }],
          }
        : {
            // enrich: incomplete contacts outside the cooldown window
            $and: [
              { $or: [{ email: null }, { title: null }, { linkedin_url: null }] },
              { $or: [{ enriched_at: null }, { enriched_at: { $lt: cooldown } }] },
            ],
          }),
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
  let outOfCredits = false;

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
      // Adaptive pacing from Apollo's rate-limit headers.
      await sleep(apolloPaceMs(1500));

      const updates: Partial<ContactDoc> = { updated_at: now };
      if (isWatch) updates.watch_checked_at = now;
      else {
        updates.enriched_at = now;
        updates.enrichment_provider = 'apollo';
      }

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
        // only signal "left the company" when the person has no current role
        // at the account at all.
        const contactName = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
        const roleAtAccount = currentRoleAtAccount(person, accountDomain, c.account_name ?? '');
        const hasAnyCurrentRole = person.employment.some((e) => e.current) || Boolean(person.org_name);

        if (!roleAtAccount && hasAnyCurrentRole && person.org_name && settings.signal_company_change_enabled) {
          const isNew = await emitSignal({
            signal_key: `${c.sfdc_id}|job_change_new_company|${person.org_name}`,
            account_sfdc_id: c.account_sfdc_id ?? undefined,
            contact_sfdc_id: c.sfdc_id,
            account_name: c.account_name ?? '',
            contact_name: contactName,
            signal_type: 'job_change_new_company',
            severity: settings.signal_company_change_severity,
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
          if (
            c.title &&
            titleAtAccount &&
            settings.signal_title_change_enabled &&
            !titlesEquivalent(c.title, titleAtAccount, settings.title_equivalences)
          ) {
            const isNew = await emitSignal({
              signal_key: `${c.sfdc_id}|job_change_new_title|${titleAtAccount}`,
              account_sfdc_id: c.account_sfdc_id ?? undefined,
              contact_sfdc_id: c.sfdc_id,
              account_name: c.account_name ?? '',
              contact_name: contactName,
              signal_type: 'job_change_new_title',
              severity: settings.signal_title_change_severity,
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
      if (!firstError) firstError = `${c.sfdc_id}: ${message}`.slice(0, 500);
      console.error(`apollo ${opts.mode} failed for ${c.sfdc_id}:`, e);
      if (message.includes('insufficient credits')) {
        outOfCredits = true;
        break; // plan is out of credits — no point continuing
      }
    }
  }

  // A full batch means more work is waiting — enqueue a follow-up job so the
  // hourly jobs cron keeps draining the backlog without anyone clicking.
  let queuedFollowUp = false;
  if (!outOfCredits && candidates.length === batchSize && batchSize > 0) {
    queuedFollowUp = await enqueueJob(
      isWatch ? 'champion_watch' : 'enrich',
      { account_sfdc_id: opts.accountScope ?? null },
      opts.createdBy ?? 'system'
    );
  }

  await logRun({
    workflow_name: isWatch ? 'champion-watch' : 'apollo-enrich',
    items_in: candidates.length,
    items_skipped_junk: 0,
    items_processed: enrichedCount,
    errors,
    notes: `budget=${batchSize} processed=${enrichedCount} noData=${noData} signals=${signals}${queuedFollowUp ? ' followUpQueued' : ''}`,
  });

  return { candidates: candidates.length, enriched: enrichedCount, noData, signals, errors, firstError, queuedFollowUp };
}
