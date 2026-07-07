import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/auth';
import { soql } from '@/lib/salesforce';

export const dynamic = 'force-dynamic';

// Debug probe: fetch one Salesforce account (?id=001...) plus its contacts,
// reporting per-object access so permission gaps are obvious.
export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const id = req.nextUrl.searchParams.get('id');
  if (!id || !/^[a-zA-Z0-9]{15,18}$/.test(id)) {
    return NextResponse.json({ error: 'pass ?id=<salesforce account id>' }, { status: 400 });
  }

  const result: Record<string, unknown> = {};

  try {
    const accounts = await soql(
      `SELECT Id, Name, Website, Industry, Owner.Email, Owner.Name FROM Account WHERE Id = '${id}'`
    );
    result.account = accounts[0] ?? 'not found (check ID / sharing rules for the integration user)';
    result.account_access = 'ok';
  } catch (e) {
    result.account_access = e instanceof Error ? e.message : String(e);
  }

  try {
    const contacts = await soql(
      `SELECT Id, FirstName, LastName, Email, Title FROM Contact WHERE AccountId = '${id}' LIMIT 50`
    );
    result.contacts = contacts;
    result.contact_count = contacts.length;
    result.contact_access = 'ok';
  } catch (e) {
    result.contact_access = e instanceof Error ? e.message : String(e);
  }

  try {
    const opps = await soql(
      `SELECT Id, Name, StageName, CloseDate, Amount FROM Opportunity WHERE AccountId = '${id}' ORDER BY CloseDate DESC LIMIT 10`
    );
    result.opportunities = opps;
    result.opportunity_access = 'ok';
  } catch (e) {
    result.opportunity_access = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(result);
}
