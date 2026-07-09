import { getWorkspaceSettings } from './workspace';
import type { NewSignal } from './types';

function render(template: string, s: NewSignal): string {
  return template
    .replaceAll('{contact}', s.contact_name || '—')
    .replaceAll('{account}', s.account_name || '—')
    .replaceAll('{previous}', s.previous_value || '—')
    .replaceAll('{new}', s.new_value || '—')
    .replaceAll('{owner}', s.csm_email || 'unassigned')
    .replaceAll('{date}', new Date(s.detected_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
    .replaceAll('{summary}', s.summary);
}

export async function notifySlack(signal: NewSignal): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.warn('SLACK_WEBHOOK_URL not set — skipping notification');
    return false;
  }

  // Templates are workspace-configurable in Settings.
  const settings = await getWorkspaceSettings();
  let text: string;
  switch (signal.signal_type) {
    case 'job_change_new_company':
      text = render(settings.slack_template_new_company, signal);
      break;
    case 'job_change_new_title':
      text = render(settings.slack_template_new_title, signal);
      break;
    case 'new_stakeholder':
      text = render(settings.slack_template_new_stakeholder, signal);
      break;
    default:
      text = `:information_source: *Renewal Signal* (${signal.severity})\n\n${signal.summary}\n\n*Account:* ${signal.account_name}\n*Account Owner:* ${signal.csm_email}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    console.error('Slack notify failed:', res.status, await res.text());
    return false;
  }
  return true;
}
