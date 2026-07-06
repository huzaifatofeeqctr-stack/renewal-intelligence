import { supabase } from './supabase';
import { createTask } from './salesforce';
import { notifySlack } from './slack';
import type { NewSignal } from './types';

// Creates a signal end-to-end: store (dedup on signal_key), mirror to a
// Salesforce Task for critical/warning, notify Slack exactly once.
// Returns true when the signal was new.
export async function emitSignal(signal: NewSignal): Promise<boolean> {
  const db = supabase();

  // Resolve internal FK ids when the SFDC ids are known.
  let accountId: string | null = null;
  let contactId: string | null = null;
  if (signal.account_sfdc_id) {
    const { data } = await db
      .from('accounts')
      .select('id')
      .eq('sfdc_id', signal.account_sfdc_id)
      .maybeSingle();
    accountId = data?.id ?? null;
  }
  if (signal.contact_sfdc_id) {
    const { data } = await db
      .from('contacts')
      .select('id')
      .eq('sfdc_id', signal.contact_sfdc_id)
      .maybeSingle();
    contactId = data?.id ?? null;
  }

  const { error: insertError } = await db.from('signals').insert({
    signal_key: signal.signal_key,
    account_id: accountId,
    contact_id: contactId,
    account_name: signal.account_name,
    contact_name: signal.contact_name,
    signal_type: signal.signal_type,
    severity: signal.severity,
    summary: signal.summary,
    previous_value: signal.previous_value,
    new_value: signal.new_value,
    source: signal.source,
    csm_email: signal.csm_email,
    detected_at: signal.detected_at,
  });

  if (insertError) {
    // 23505 = unique violation on signal_key → already emitted, not an error.
    if (insertError.code === '23505') return false;
    throw new Error(`signal insert failed: ${insertError.message}`);
  }

  if (signal.severity !== 'info') {
    const due = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const taskId = await createTask({
      Subject: `[Renewal Signal] ${signal.summary}`.slice(0, 255),
      Description: [
        `Renewal Intelligence signal (${signal.severity}, source: ${signal.source})`,
        '',
        signal.summary,
        '',
        `Previous: ${signal.previous_value}`,
        `New: ${signal.new_value}`,
        `Detected: ${signal.detected_at}`,
      ].join('\n'),
      WhoId: signal.contact_sfdc_id || undefined,
      ActivityDate: due,
    });
    if (taskId) {
      await db.from('signals').update({ sfdc_task_id: taskId }).eq('signal_key', signal.signal_key);
    }
  }

  // notification_log guarantees once-per-signal_key even across re-runs.
  const { error: notifError } = await db
    .from('notification_log')
    .insert({ signal_key: signal.signal_key, channel: 'slack-webhook' });
  if (!notifError) {
    await notifySlack(signal);
  }

  return true;
}
