import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/authn';
import { coll } from '@/lib/db';
import type { AccountDoc, ContactDoc, SignalDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET: account detail payload for the popup (account + signals + contacts).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const account = await (await coll<AccountDoc>('accounts')).findOne({ sfdc_id: params.id });
  if (!account) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const [signals, contacts] = await Promise.all([
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
  ]);

  return NextResponse.json({
    account: { ...account, _id: undefined },
    signals: signals.map((s) => ({ ...s, _id: String((s as { _id?: unknown })._id) })),
    contacts: contacts.map((c) => ({ ...c, _id: undefined })),
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
