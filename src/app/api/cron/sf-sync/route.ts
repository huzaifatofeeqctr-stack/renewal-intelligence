import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth, logRun } from '@/lib/auth';
import { soql } from '@/lib/salesforce';
import { junkCheck } from '@/lib/cleaning';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface SfAccount {
  Id: string;
  Name: string;
  Website: string | null;
  Industry: string | null;
  Owner: { Email: string | null } | null;
}

interface SfContact {
  Id: string;
  FirstName: string | null;
  LastName: string | null;
  Email: string | null;
  Title: string | null;
  AccountId: string | null;
}

// Pulls accounts + contacts from Salesforce into the Supabase read model.
// Junk contacts are stored flagged (never dropped) so the dashboard can show them.
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const db = supabase();
  let errors = 0;

  const sfAccounts = await soql<SfAccount>(
    'SELECT Id, Name, Website, Industry, Owner.Email FROM Account WHERE Id IN (SELECT AccountId FROM Contact) LIMIT 2000'
  );
  for (const a of sfAccounts) {
    const { error } = await db.from('accounts').upsert(
      {
        sfdc_id: a.Id,
        name: a.Name,
        website: a.Website,
        industry: a.Industry,
        owner_email: a.Owner?.Email ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'sfdc_id' }
    );
    if (error) errors++;
  }

  const { data: accountRows } = await db.from('accounts').select('id, sfdc_id');
  const accountIdBySfdc = new Map((accountRows ?? []).map((r) => [r.sfdc_id, r.id]));

  const sfContacts = await soql<SfContact>(
    'SELECT Id, FirstName, LastName, Email, Title, AccountId FROM Contact WHERE AccountId != null LIMIT 10000'
  );
  let junkCount = 0;
  for (const c of sfContacts) {
    const verdict = junkCheck({ email: c.Email, firstName: c.FirstName, lastName: c.LastName });
    if (verdict.isJunk) junkCount++;
    const { error } = await db.from('contacts').upsert(
      {
        sfdc_id: c.Id,
        account_id: c.AccountId ? accountIdBySfdc.get(c.AccountId) ?? null : null,
        first_name: c.FirstName,
        last_name: c.LastName,
        email: c.Email?.toLowerCase() ?? null,
        title: c.Title,
        is_junk: verdict.isJunk,
        junk_reason: verdict.reason,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'sfdc_id' }
    );
    if (error) errors++;
  }

  await logRun({
    workflow_name: 'sf-sync',
    items_in: sfAccounts.length + sfContacts.length,
    items_skipped_junk: junkCount,
    items_processed: sfAccounts.length + sfContacts.length - errors,
    errors,
    notes: `accounts=${sfAccounts.length} contacts=${sfContacts.length}`,
  });

  return NextResponse.json({
    accounts: sfAccounts.length,
    contacts: sfContacts.length,
    junkFlagged: junkCount,
    errors,
  });
}
