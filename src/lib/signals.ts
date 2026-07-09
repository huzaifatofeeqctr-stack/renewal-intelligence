import { coll, isDuplicateKeyError } from './db';
import { notifySlack } from './slack';
import type { NewSignal, SignalDoc } from './types';

// Creates a signal end-to-end: store (dedup on signal_key) and notify Slack
// exactly once. Salesforce is READ-ONLY for this app — signals are never
// mirrored back as Tasks or objects.
export async function emitSignal(signal: NewSignal): Promise<boolean> {
  const signals = await coll<SignalDoc>('signals');

  const doc: SignalDoc = {
    signal_key: signal.signal_key,
    account_sfdc_id: signal.account_sfdc_id ?? null,
    contact_sfdc_id: signal.contact_sfdc_id ?? null,
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
    sfdc_task_id: null,
    dismissed: false,
    dismissed_at: null,
    relevance: null,
    created_at: new Date().toISOString(),
  };

  try {
    await signals.insertOne(doc);
  } catch (e) {
    if (isDuplicateKeyError(e)) return false; // already emitted — not an error
    throw e;
  }

  // notification_log's unique index guarantees once-per-signal_key across re-runs.
  const notifications = await coll('notification_log');
  try {
    await notifications.insertOne({
      signal_key: signal.signal_key,
      notified_at: new Date().toISOString(),
      channel: 'slack-webhook',
    });
    await notifySlack(signal);
  } catch (e) {
    if (!isDuplicateKeyError(e)) throw e;
  }

  return true;
}
