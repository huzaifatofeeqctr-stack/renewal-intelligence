import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/authn';
import { requireCronAuth } from '@/lib/auth';
import { soql } from '@/lib/salesforce';
import { coll } from '@/lib/db';
import type { AccountDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET /api/sf/search?q=<name> — search Salesforce accounts by name.
// Auth: dashboard session OR cron secret (for scripted imports).
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user && requireCronAuth(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json({ error: 'query too short' }, { status: 400 });
  }
  const safe = q.replace(/(['\\])/g, '\\$1').replace(/%/g, '');

  try {
    const results = await soql<{
      Id: string;
      Name: string;
      Website: string | null;
      Industry: string | null;
      Owner: { Email: string | null } | null;
    }>(
      `SELECT Id, Name, Website, Industry, Owner.Email FROM Account WHERE Name LIKE '%${safe}%' ORDER BY Name LIMIT 20`
    );

    const accounts = await coll<AccountDoc>('accounts');
    const trackedIds = new Set(
      (await accounts.find({ sfdc_id: { $in: results.map((r) => r.Id) } }).project({ sfdc_id: 1 }).toArray()).map(
        (a) => a.sfdc_id as string
      )
    );

    return NextResponse.json({
      results: results.map((r) => ({
        sfdc_id: r.Id,
        name: r.Name,
        website: r.Website,
        industry: r.Industry,
        owner_email: r.Owner?.Email ?? null,
        tracked: trackedIds.has(r.Id),
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
