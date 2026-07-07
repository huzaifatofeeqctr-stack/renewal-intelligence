import { coll, isDuplicateKeyError } from './db';
import { createTask } from './salesforce';
import { notifySlack } from './slack';
import type { NewSignal, SignalDoc } from './types';

// Creates a signal end-to-end: store (dedup on signal_key), mirror to a
// Salesforce Task for critical/warning, notify Slack exactly once.
// Returns true when the signal was new.
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
      await signals.updateOne({ signal_key: signal.signal_key }, { $set: { sfdc_task_id: taskId } });
    }
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
