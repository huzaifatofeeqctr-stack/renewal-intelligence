import { NextRequest, NextResponse } from 'next/server';
import { coll } from '@/lib/db';
import { updateContact } from '@/lib/salesforce';
import { parseClayCallback } from '@/lib/clay';
import { logRun } from '@/lib/auth';
import type { ContactDoc } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Clay HTTP-API column POSTs each enriched row here with ?secret=<CLAY_CALLBACK_SECRET>.
// Fill-only-empty: existing values are never overwritten, and emails are only
// written when Clay marks them valid.
export async function POST(req: NextRequest) {
  const secret = process.env.CLAY_CALLBACK_SECRET;
  if (secret && req.nextUrl.searchParams.get('secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const payload = body ? parseClayCallback(body) : null;
  if (!payload) {
    return NextResponse.json({ error: 'missing contact_id' }, { status: 400 });
  }

  const contacts = await coll<ContactDoc>('contacts');
  const current = await contacts.findOne({ sfdc_id: payload.contact_id });
  if (!current) {
    return NextResponse.json({ error: 'unknown contact' }, { status: 404 });
  }

  const emailUsable = payload.email_valid === 'valid' && payload.work_email;
  const updates: Partial<ContactDoc> = {
    email_valid: payload.email_valid,
    clay_last_run: new Date().toISOString(),
    work_email_provider: payload.provider_used,
    updated_at: new Date().toISOString(),
  };
  if (!current.email && emailUsable) {
    updates.email = payload.work_email.toLowerCase();
    updates.work_email = payload.work_email.toLowerCase();
  }
  if (!current.title && payload.title) updates.title = payload.title;
  if (!current.linkedin_url && payload.linkedin_url) updates.linkedin_url = payload.linkedin_url;
  if (!current.personal_email && payload.personal_email) updates.personal_email = payload.personal_email;

  await contacts.updateOne({ sfdc_id: payload.contact_id }, { $set: updates });

  // Mirror filled blanks back to Salesforce (standard fields only).
  const sfFields: Record<string, string> = {};
  if (!current.email && emailUsable) sfFields.Email = payload.work_email.toLowerCase();
  if (!current.title && payload.title) sfFields.Title = payload.title;
  if (Object.keys(sfFields).length > 0) {
    await updateContact(payload.contact_id, sfFields);
  }

  await logRun({
    workflow_name: 'clay-callback',
    items_in: 1,
    items_skipped_junk: 0,
    items_processed: 1,
    errors: 0,
    notes: `contact=${payload.contact_id} provider=${payload.provider_used} fields=${Object.keys(updates).join(',')}`,
  });

  return NextResponse.json({ ok: true, updated: Object.keys(updates) });
}
