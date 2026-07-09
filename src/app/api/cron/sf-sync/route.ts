import { NextRequest, NextResponse } from 'next/server';
import { requireCronOrAdmin, logRun } from '@/lib/auth';
import { getWorkspaceSettings, nowInZone } from '@/lib/workspace';
import { coll } from '@/lib/db';
import { soql } from '@/lib/salesforce';
import { importAccounts } from '@/lib/sf-import';
import type { AccountDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Default: daily refresh of TRACKED accounts only (accounts enter the tracked
// set via /import or POST /api/sf/import). Pass ?mode=full to pull the whole
// Salesforce book (up to 2000 accounts) instead.
export async function GET(req: NextRequest) {
  try {
    return await run(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('sf-sync failed:', e);
    const { notifyOps } = await import('@/lib/slack');
    await notifyOps(`*sf-sync* crashed: ${message.slice(0, 400)}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function run(req: NextRequest) {
  const denied = await requireCronOrAdmin(req);
  if (denied) return denied;

  const settings = await getWorkspaceSettings();
  if (!settings.sf_sync_enabled && req.nextUrl.searchParams.get('force') !== '1') {
    return NextResponse.json({ skipped: true, reason: 'Salesforce sync is paused in workspace settings' });
  }
  // Hourly cron invokes with ?scheduled=1 — only run at the configured local hour.
  if (req.nextUrl.searchParams.get('scheduled') === '1') {
    const { hour } = nowInZone(settings.timezone);
    if (hour !== settings.sf_sync_hour) {
      return NextResponse.json({ skipped: true, reason: `scheduled for ${settings.sf_sync_hour}:00 ${settings.timezone}, now ${hour}:00` });
    }
  }

  const fullMode = req.nextUrl.searchParams.get('mode') === 'full';
  let ids: string[];

  if (fullMode) {
    const all = await soql<{ Id: string }>(
      'SELECT Id FROM Account WHERE Id IN (SELECT AccountId FROM Contact) LIMIT 2000'
    );
    ids = all.map((a) => a.Id);
  } else {
    const accounts = await coll<AccountDoc>('accounts');
    const tracked = await accounts
      .find({ sfdc_id: { $not: /^DEMO-/ } })
      .project<Pick<AccountDoc, 'sfdc_id'>>({ sfdc_id: 1 })
      .toArray();
    ids = tracked.map((a) => a.sfdc_id);
  }

  if (ids.length === 0) {
    return NextResponse.json({ tracked: 0, note: 'no tracked accounts — import some via /import' });
  }

  const result = await importAccounts(ids);

  await logRun({
    workflow_name: 'sf-sync',
    items_in: ids.length,
    items_skipped_junk: result.junk,
    items_processed: result.accounts + result.contacts,
    errors: result.errors,
    notes: `${fullMode ? "full" : "tracked"} sync: accounts=${result.accounts} contacts=${result.contacts}`,
    items: result.perAccount.map((a) => ({
      name: a.name,
      account_sfdc_id: a.sfdc_id,
      action: 'synced',
      detail: `${a.contacts} contacts pulled (${a.junk} junk-flagged)${a.renewal_date ? ` · renewal ${a.renewal_date}` : ''}`,
    })),
  });

  return NextResponse.json({ tracked: ids.length, ...result });
}
