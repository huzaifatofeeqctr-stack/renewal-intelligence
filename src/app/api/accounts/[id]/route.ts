import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/authn';
import { coll } from '@/lib/db';
import type { AccountDoc, ContactDoc, SignalDoc, RunLogDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET: account detail payload for the popup (account + signals + contacts).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const account = await (await coll<AccountDoc>('accounts')).findOne({ sfdc_id: params.id });
  if (!account) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const [signals, contacts, historyRaw] = await Promise.all([
    (await coll<SignalDoc>('signals'))
      .find({ account_sfdc_id: params.id })
      .sort({ dismissed: 1, detected_at: -1 })
      .limit(100)
      .toArray(),
    (await coll<ContactDoc>('contacts'))
      .find({ account_sfdc_id: params.id })
      .sort({ is_junk: 1, last_name: 1 })
      .limit(200)
      .toArray(),
    // Runs that touched THIS account: scoped runs, or global runs whose
    // per-item trace mentions it.
    (await coll<RunLogDoc>('enrichment_run_log'))
      .find({ $or: [{ account_sfdc_id: params.id }, { 'items.account_sfdc_id': params.id }] })
      .sort({ run_at: -1 })
      .limit(30)
      .toArray(),
  ]);

  const history = historyRaw.map((r) => ({
    id: String((r as { _id?: unknown })._id),
    workflow_name: r.workflow_name,
    run_at: r.run_at,
    errors: r.errors,
    notes: r.notes,
    // Only this account's trace lines are relevant here.
    items: (r.items ?? []).filter((i) => i.account_sfdc_id === params.id),
  }));

  const enrichedDates = contacts.map((c) => c.enriched_at).filter((d): d is string => Boolean(d));
  const lastEnrichedAt = enrichedDates.length > 0 ? enrichedDates.sort().slice(-1)[0] : null;

  return NextResponse.json({
    // Lets the UI deep-link records back to Salesforce (read-only links).
    sf_base: (process.env.SF_INSTANCE_URL ?? '').replace(/\/$/, '') || null,
    account: { ...account, _id: undefined, last_enriched_at: lastEnrichedAt },
    signals: signals.map((s) => ({ ...s, _id: String((s as { _id?: unknown })._id) })),
    contacts: contacts.map((c) => ({ ...c, _id: undefined })),
    history,
  });
}

// DELETE: untrack the account — removes it and its contacts/signals from the
// app only. Salesforce is never touched.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [a, c, s] = await Promise.all([
    (await coll('accounts')).deleteOne({ sfdc_id: params.id }),
    (await coll('contacts')).deleteMany({ account_sfdc_id: params.id }),
    (await coll('signals')).deleteMany({ account_sfdc_id: params.id }),
  ]);
  if (a.deletedCount === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ ok: true, contacts_removed: c.deletedCount, signals_removed: s.deletedCount });
}
