import { coll, isDuplicateKeyError } from './db';
import { notifySlack } from './slack';
import { getWorkspaceSettings } from './workspace';
import type { NewSignal, SignalDoc } from './types';

// A signal previously rated "inaccurate" for the same person suppresses
// re-emission — the feedback loop teaching the detector to stay quiet.
async function isSuppressed(signal: NewSignal): Promise<boolean> {
  const signals = await coll<SignalDoc>('signals');
  const prior = await signals.findOne(
    signal.contact_sfdc_id
      ? { contact_sfdc_id: signal.contact_sfdc_id, signal_type: signal.signal_type, relevance: 'inaccurate' }
      : {
          account_sfdc_id: signal.account_sfdc_id ?? null,
          contact_name: signal.contact_name,
          signal_type: signal.signal_type,
          relevance: 'inaccurate',
        },
    { projection: { _id: 1 } }
  );
  return prior !== null;
}

// Creates a signal end-to-end: store (dedup on signal_key) and notify Slack
// exactly once — instantly, or via the daily digest when slack_mode is
// 'digest' (the digest cron claims un-notified signals from notification_log).
// Salesforce is READ-ONLY for this app — signals are never mirrored back.
export async function emitSignal(signal: NewSignal): Promise<boolean> {
  const signals = await coll<SignalDoc>('signals');

  if (await isSuppressed(signal)) return false;

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
    status: 'new',
    status_changed_at: null,
    status_changed_by: null,
    relevance: null,
    created_at: new Date().toISOString(),
  };

  try {
    await signals.insertOne(doc);
  } catch (e) {
    if (isDuplicateKeyError(e)) return false; // already emitted — not an error
    throw e;
  }

  const settings = await getWorkspaceSettings();
  if (settings.slack_mode === 'digest') return true; // digest cron notifies later

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
