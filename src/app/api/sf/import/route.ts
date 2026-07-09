import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/authn';
import { requireCronAuth, logRun } from '@/lib/auth';
import { importAccounts } from '@/lib/sf-import';

export const dynamic = 'force-dynamic';

// POST /api/sf/import { account_id } — import a Salesforce account and all
// its contacts into the tracked set. Auth: session OR cron secret.
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user && requireCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { account_id?: string };
  const id = (body.account_id ?? '').trim();
  if (!/^[a-zA-Z0-9]{15,18}$/.test(id)) {
    return NextResponse.json({ error: 'pass a valid Salesforce account_id' }, { status: 400 });
  }

  try {
    const result = await importAccounts([id]);
    if (result.accounts === 0) {
      return NextResponse.json({ error: 'account not found in Salesforce' }, { status: 404 });
    }
    await logRun({
      workflow_name: 'sf-import',
      items_in: 1,
      items_skipped_junk: result.junk,
      items_processed: result.contacts,
      errors: result.errors,
      notes: `imported account ${id} by ${user?.email ?? 'cron'}`,
      account_sfdc_id: id,
      items: result.perAccount.map((a) => ({
        name: a.name,
        account_sfdc_id: a.sfdc_id,
        action: 'imported',
        detail: `${a.contacts} contacts pulled (${a.junk} junk-flagged)${a.renewal_date ? ` · renewal ${a.renewal_date}` : ''}`,
      })),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
