import { NextRequest, NextResponse } from 'next/server';
import { requireCronOrAdmin, logRun } from '@/lib/auth';
import { getWorkspaceSettings, nowInZone } from '@/lib/workspace';
import { coll } from '@/lib/db';
import { searchPeopleByDomain, matchPerson, icpTitles, normalizeDomain } from '@/lib/apollo';
import { emitSignal } from '@/lib/signals';
import type { AccountDoc, ContactDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ACCOUNTS_PER_RUN = 15; // rotates through the book over successive runs
const REVEAL_BUDGET = 25; // people/match reveals per run — 1 credit each

// Daily: Apollo people-search by account domain filtered to ICP titles,
// diffed against CRM contacts. Decision-makers we don't have become
// new_stakeholder signals. Search is free; only genuinely-new people are
// revealed (budgeted).
export async function GET(req: NextRequest) {
  try {
    return await run(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('apollo-stakeholders failed:', e);
    const { notifyOps } = await import('@/lib/slack');
    await notifyOps(`*apollo-stakeholders* crashed: ${message.slice(0, 400)}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function run(req: NextRequest) {
  const denied = await requireCronOrAdmin(req);
  if (denied) return denied;

  const settings = await getWorkspaceSettings();
  if (!settings.stakeholder_discovery_enabled && req.nextUrl.searchParams.get('force') !== '1') {
    return NextResponse.json({ skipped: true, reason: 'stakeholder discovery is paused in workspace settings' });
  }
  if (req.nextUrl.searchParams.get('scheduled') === '1') {
    const { hour } = nowInZone(settings.timezone);
    if (hour !== settings.stakeholder_hour) {
      return NextResponse.json({ skipped: true, reason: `scheduled for ${settings.stakeholder_hour}:00 ${settings.timezone}, now ${hour}:00` });
    }
  }
  const revealBudget = settings.stakeholder_reveal_budget;
  const accounts = await coll<AccountDoc>('accounts');
  const contacts = await coll<ContactDoc>('contacts');
  const titles = settings.icp_titles
    ? settings.icp_titles.split(',').map((t) => t.trim()).filter(Boolean)
    : icpTitles();

  const batch = await accounts
    .find({ website: { $nin: [null, ''] } })
    .sort({ stakeholders_checked_at: 1 })
    .limit(settings.stakeholder_accounts_per_run)
    .toArray();

  const now = new Date().toISOString();
  let reveals = 0;
  let newStakeholders = 0;
  let errors = 0;

  for (const account of batch) {
    const domain = normalizeDomain(account.website);
    if (!domain) continue;
    try {
      const hits = await searchPeopleByDomain(domain, titles);
      const existing = await contacts
        .find({ account_sfdc_id: account.sfdc_id })
        .project<Pick<ContactDoc, 'first_name' | 'email'>>({ first_name: 1, email: 1 })
        .toArray();
      const existingFirstNames = new Set(
        existing.map((c) => (c.first_name ?? '').toLowerCase().trim()).filter(Boolean)
      );

      for (const hit of hits) {
        if (reveals >= revealBudget) break;
        // Cheap pre-filter before spending a credit: same first name at the
        // account probably means we already have them.
        if (existingFirstNames.has(hit.first_name.toLowerCase().trim())) continue;

        const person = await matchPerson({ id: hit.id });
        reveals++;
        if (!person) continue;

        if (person.email) {
          const known = await contacts.findOne({ email: person.email.toLowerCase() });
          if (known) continue;
        }

        const isNew = await emitSignal({
          signal_key: `apollo|${account.sfdc_id}|${person.email || hit.id}`,
          account_sfdc_id: account.sfdc_id,
          account_name: account.name,
          contact_name: person.name,
          signal_type: 'new_stakeholder',
          severity: settings.signal_new_stakeholder_severity,
          summary: `${person.name} — ${person.title} at ${account.name} is not in the CRM${person.email ? ` (${person.email})` : ''}`,
          previous_value: '',
          new_value: person.title,
          source: 'apollo',
          csm_email: account.owner_email ?? '',
          detected_at: now,
        });
        if (isNew) newStakeholders++;
      }
    } catch (e) {
      errors++;
      console.error(`stakeholder scan failed for ${account.name}:`, e);
    }
    await accounts.updateOne({ sfdc_id: account.sfdc_id }, { $set: { stakeholders_checked_at: now } });
  }

  await logRun({
    workflow_name: 'apollo-stakeholders',
    items_in: batch.length,
    items_skipped_junk: 0,
    items_processed: reveals,
    errors,
    notes: `accounts=${batch.length} reveals=${reveals} newStakeholders=${newStakeholders} titles=${titles.length}`,
  });

  return NextResponse.json({ accounts: batch.length, reveals, newStakeholders, errors });
}
