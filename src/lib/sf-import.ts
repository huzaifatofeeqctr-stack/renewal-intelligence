import { soql } from './salesforce';
import { junkCheck } from './cleaning';
import { coll } from './db';
import type { AccountDoc, ContactDoc } from './types';

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

interface SfOpportunity {
  AccountId: string;
  CloseDate: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function idList(ids: string[]): string {
  return ids.map((id) => `'${id.replace(/[^a-zA-Z0-9]/g, '')}'`).join(',');
}

// Imports/refreshes the given Salesforce accounts and all their contacts into
// MongoDB (denormalized, junk-gated). Used by the import UI and the daily
// tracked-accounts refresh.
export async function importAccounts(
  accountIds: string[]
): Promise<{ accounts: number; contacts: number; junk: number; errors: number }> {
  const accountsColl = await coll<AccountDoc>('accounts');
  const contactsColl = await coll<ContactDoc>('contacts');
  const now = new Date().toISOString();
  let accountsN = 0;
  let contactsN = 0;
  let junk = 0;
  let errors = 0;

  for (const ids of chunk(accountIds, 100)) {
    const sfAccounts = await soql<SfAccount>(
      `SELECT Id, Name, Website, Industry, Owner.Email FROM Account WHERE Id IN (${idList(ids)})`
    );
    const accountById = new Map(sfAccounts.map((a) => [a.Id, a]));

    // Renewal date = earliest open Opportunity close date per account.
    // Tolerated failure: the integration user may lack Opportunity access.
    const renewalByAccount = new Map<string, string>();
    try {
      const opps = await soql<SfOpportunity>(
        `SELECT AccountId, CloseDate FROM Opportunity WHERE AccountId IN (${idList(ids)}) AND IsClosed = false ORDER BY CloseDate ASC`
      );
      for (const o of opps) {
        if (o.AccountId && o.CloseDate && !renewalByAccount.has(o.AccountId)) {
          renewalByAccount.set(o.AccountId, o.CloseDate);
        }
      }
    } catch (e) {
      console.warn('Opportunity query failed (renewal dates skipped):', e instanceof Error ? e.message : e);
    }

    if (sfAccounts.length > 0) {
      const res = await accountsColl.bulkWrite(
        sfAccounts.map((a) => ({
          updateOne: {
            filter: { sfdc_id: a.Id },
            update: {
              $set: {
                name: a.Name,
                website: a.Website,
                industry: a.Industry,
                owner_email: a.Owner?.Email ?? null,
                renewal_date: renewalByAccount.get(a.Id) ?? null,
                updated_at: now,
              },
              $setOnInsert: { sfdc_id: a.Id, stakeholders_checked_at: null },
            },
            upsert: true,
          },
        })),
        { ordered: false }
      );
      errors += res.getWriteErrors?.().length ?? 0;
      accountsN += sfAccounts.length;
    }

    const sfContacts = await soql<SfContact>(
      `SELECT Id, FirstName, LastName, Email, Title, AccountId FROM Contact WHERE AccountId IN (${idList(ids)})`
    );
    if (sfContacts.length > 0) {
      const ops = sfContacts.map((c) => {
        const verdict = junkCheck({ email: c.Email, firstName: c.FirstName, lastName: c.LastName });
        if (verdict.isJunk) junk++;
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
                account_renewal_date: c.AccountId ? renewalByAccount.get(c.AccountId) ?? null : null,
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
                work_email: null,
                email_valid: 'unknown' as const,
                personal_email: null,
                linkedin_url: null,
                enriched_at: null,
                enrichment_provider: null,
              },
            },
            upsert: true,
          },
        };
      });
      const res = await contactsColl.bulkWrite(ops, { ordered: false });
      errors += res.getWriteErrors?.().length ?? 0;
      contactsN += sfContacts.length;
    }
  }

  return { accounts: accountsN, contacts: contactsN, junk, errors };
}
