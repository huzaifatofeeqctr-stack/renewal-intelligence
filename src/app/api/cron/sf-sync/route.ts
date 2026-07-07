import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth, logRun } from '@/lib/auth';
import { soql } from '@/lib/salesforce';
import { junkCheck } from '@/lib/cleaning';
import { coll } from '@/lib/db';
import type { AccountDoc, ContactDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

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

// Pulls accounts + contacts from Salesforce into MongoDB. Account fields are
// denormalized onto contacts so downstream reads never need joins.
// Junk contacts are stored flagged (never dropped) so the dashboard shows them.
export async function GET(req: NextRequest) {
  try {
    return await run(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('sf-sync failed:', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function run(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const accounts = await coll<AccountDoc>('accounts');
  const contacts = await coll<ContactDoc>('contacts');
  const now = new Date().toISOString();
  let errors = 0;

  const sfAccounts = await soql<SfAccount>(
    'SELECT Id, Name, Website, Industry, Owner.Email FROM Account WHERE Id IN (SELECT AccountId FROM Contact) LIMIT 2000'
  );
  const accountById = new Map(sfAccounts.map((a) => [a.Id, a]));

  if (sfAccounts.length > 0) {
    const result = await accounts.bulkWrite(
      sfAccounts.map((a) => ({
        updateOne: {
          filter: { sfdc_id: a.Id },
          update: {
            $set: {
              name: a.Name,
              website: a.Website,
              industry: a.Industry,
              owner_email: a.Owner?.Email ?? null,
              updated_at: now,
            },
            $setOnInsert: { sfdc_id: a.Id, renewal_date: null },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );
    errors += result.getWriteErrors?.().length ?? 0;
  }

  const sfContacts = await soql<SfContact>(
    'SELECT Id, FirstName, LastName, Email, Title, AccountId FROM Contact WHERE AccountId != null LIMIT 10000'
  );
  let junkCount = 0;

  if (sfContacts.length > 0) {
    const ops = sfContacts.map((c) => {
      const verdict = junkCheck({ email: c.Email, firstName: c.FirstName, lastName: c.LastName });
      if (verdict.isJunk) junkCount++;
      const account = c.AccountId ? accountById.get(c.AccountId) : undefined;
      return {
        updateOne: {
          filter: { sfdc_id: c.Id },
          update: {
            $set: {
              account_sfdc_id: c.AccountId,
              account_name: account?.Name ?? null,
              account_owner_email: account?.Owner?.Email ?? null,
              account_website: account?.Website ?? null,
              first_name: c.FirstName,
              last_name: c.LastName,
              email: c.Email?.toLowerCase() ?? null,
              title: c.Title,
              is_junk: verdict.isJunk,
              junk_reason: verdict.reason,
              updated_at: now,
            },
            $setOnInsert: {
              sfdc_id: c.Id,
              account_renewal_date: null,
              work_email: null,
              email_valid: 'unknown' as const,
              personal_email: null,
              linkedin_url: null,
              clay_last_run: null,
              work_email_provider: null,
            },
          },
          upsert: true,
        },
      };
    });
    const result = await contacts.bulkWrite(ops, { ordered: false });
    errors += result.getWriteErrors?.().length ?? 0;
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
