import type { NewSignal } from './types';

function formatMessage(s: NewSignal): string {
  switch (s.signal_type) {
    case 'job_change_new_company':
      return [
        ':rotating_light: *Champion Left — Action Required*',
        '',
        `*${s.contact_name}* has left *${s.previous_value}* and is now at *${s.new_value}*.`,
        '',
        `*Account:* ${s.account_name}`,
        `*Account Owner:* ${s.csm_email}`,
        `*Detected:* ${s.detected_at}`,
      ].join('\n');
    case 'job_change_new_title':
      return [
        ':warning: *Title Change Detected*',
        '',
        `*${s.contact_name}* at *${s.account_name}* changed titles.`,
        `*Before:* ${s.previous_value}`,
        `*After:* ${s.new_value}`,
        '',
        `*Account Owner:* ${s.csm_email}`,
        `*Detected:* ${s.detected_at}`,
      ].join('\n');
    case 'new_stakeholder':
      return [
        ':bust_in_silhouette: *New Stakeholder Identified*',
        '',
        `*${s.contact_name}* — *${s.new_value}* at *${s.account_name}* is not in the CRM.`,
        'They match the ICP title filters. Consider adding them as a contact.',
        '',
        `*Account Owner:* ${s.csm_email}`,
        `*Detected:* ${s.detected_at}`,
      ].join('\n');
    default:
      return [
        `:information_source: *Renewal Signal* (${s.severity})`,
        '',
        s.summary,
        '',
        `*Account:* ${s.account_name}`,
        `*Account Owner:* ${s.csm_email}`,
      ].join('\n');
  }
}

export async function notifySlack(signal: NewSignal): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.warn('SLACK_WEBHOOK_URL not set — skipping notification');
    return false;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: formatMessage(signal) }),
  });
  if (!res.ok) {
    console.error('Slack notify failed:', res.status, await res.text());
    return false;
  }
  return true;
}
