import { coll } from './db';

// Workspace-wide operational settings, editable by admins in /settings.
// Cron/enrichment routes consult these on every run.
export interface WorkspaceSettings {
  sf_sync_enabled: boolean;
  enrich_batch_size: number; // Apollo match calls per run (credit budget)
  enrich_cooldown_days: number; // re-enrichment cooldown per contact
  stakeholder_discovery_enabled: boolean;
  stakeholder_reveal_budget: number; // reveals (credits) per discovery run
  stakeholder_accounts_per_run: number; // accounts scanned per discovery run
  icp_titles: string; // comma-separated titles for stakeholder discovery
  // Scheduling: Railway crons fire hourly with ?scheduled=1; each job only
  // actually runs when the current time in `timezone` matches its setting.
  timezone: string; // IANA zone, e.g. 'America/New_York'
  sf_sync_hour: number; // 0-23 local hour for the daily SF refresh
  stakeholder_hour: number; // 0-23 local hour for daily discovery
  industry_intel_day: number; // 0 (Sunday) - 6 (Saturday)
  industry_intel_hour: number; // 0-23 local hour on that day
  // Signal rules — the definitions of what fires an alert, editable in Settings.
  signal_company_change_enabled: boolean;
  signal_company_change_severity: 'critical' | 'warning' | 'info';
  signal_title_change_enabled: boolean;
  signal_title_change_severity: 'critical' | 'warning' | 'info';
  signal_new_stakeholder_severity: 'critical' | 'warning' | 'info';
  // Extra title equivalences, one pair per line: "Co-Founder = Founder".
  // Pairs listed here never fire a title-change signal.
  title_equivalences: string;
  // Slack alert templates. Placeholders: {contact} {account} {previous} {new}
  // {owner} {date} {summary}
  slack_template_new_company: string;
  slack_template_new_title: string;
  slack_template_new_stakeholder: string;
  updated_at?: string;
  updated_by?: string;
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  sf_sync_enabled: true,
  enrich_batch_size: 30,
  enrich_cooldown_days: 90,
  stakeholder_discovery_enabled: true,
  stakeholder_reveal_budget: 25,
  stakeholder_accounts_per_run: 15,
  icp_titles:
    'Chief Marketing Officer, CMO, VP Marketing, VP Ecommerce, VP of Digital, Director of Ecommerce, Head of Retention, Director of Retention, Director of Lifecycle',
  timezone: 'UTC',
  sf_sync_hour: 5,
  stakeholder_hour: 7,
  industry_intel_day: 0,
  industry_intel_hour: 4,
  signal_company_change_enabled: true,
  signal_company_change_severity: 'critical',
  signal_title_change_enabled: true,
  signal_title_change_severity: 'warning',
  signal_new_stakeholder_severity: 'warning',
  title_equivalences: '',
  slack_template_new_company:
    ':rotating_light: *Champion Left — Action Required*\n\n*{contact}* has left *{previous}* and is now at *{new}*.\n\n*Account:* {account}\n*Account Owner:* {owner}\n*Detected:* {date}',
  slack_template_new_title:
    ':warning: *Title Change Detected*\n\n*{contact}* at *{account}* changed titles.\n*Before:* {previous}\n*After:* {new}\n\n*Account Owner:* {owner}\n*Detected:* {date}',
  slack_template_new_stakeholder:
    ':bust_in_silhouette: *New Stakeholder Identified*\n\n*{contact}* — *{new}* at *{account}* is not in the CRM.\nThey match the ICP title filters. Consider adding them as a contact.\n\n*Account Owner:* {owner}\n*Detected:* {date}',
};

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Current hour (0-23) and weekday (0=Sunday) in the workspace timezone.
export function nowInZone(tz: string): { hour: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: isValidTimezone(tz) ? tz : 'UTC',
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10) % 24;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = days.indexOf(parts.find((p) => p.type === 'weekday')?.value ?? 'Sun');
  return { hour, day: day < 0 ? 0 : day };
}

const KEY = 'workspace';

export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  const c = await coll('workspace_settings');
  const doc = await c.findOne({ key: KEY });
  return { ...DEFAULT_WORKSPACE_SETTINGS, ...((doc ?? {}) as Partial<WorkspaceSettings>) };
}

export async function updateWorkspaceSettings(
  patch: Partial<WorkspaceSettings>,
  updatedBy: string
): Promise<WorkspaceSettings> {
  const clean: Partial<WorkspaceSettings> = {};
  if (typeof patch.sf_sync_enabled === 'boolean') clean.sf_sync_enabled = patch.sf_sync_enabled;
  if (typeof patch.stakeholder_discovery_enabled === 'boolean')
    clean.stakeholder_discovery_enabled = patch.stakeholder_discovery_enabled;
  if (typeof patch.enrich_batch_size === 'number')
    clean.enrich_batch_size = Math.min(100, Math.max(5, Math.round(patch.enrich_batch_size)));
  if (typeof patch.enrich_cooldown_days === 'number')
    clean.enrich_cooldown_days = Math.min(365, Math.max(7, Math.round(patch.enrich_cooldown_days)));
  if (typeof patch.stakeholder_reveal_budget === 'number')
    clean.stakeholder_reveal_budget = Math.min(100, Math.max(0, Math.round(patch.stakeholder_reveal_budget)));
  if (typeof patch.stakeholder_accounts_per_run === 'number')
    clean.stakeholder_accounts_per_run = Math.min(100, Math.max(1, Math.round(patch.stakeholder_accounts_per_run)));
  if (typeof patch.icp_titles === 'string' && patch.icp_titles.trim()) clean.icp_titles = patch.icp_titles.trim();
  if (typeof patch.timezone === 'string' && isValidTimezone(patch.timezone)) clean.timezone = patch.timezone;
  if (typeof patch.sf_sync_hour === 'number')
    clean.sf_sync_hour = Math.min(23, Math.max(0, Math.round(patch.sf_sync_hour)));
  if (typeof patch.stakeholder_hour === 'number')
    clean.stakeholder_hour = Math.min(23, Math.max(0, Math.round(patch.stakeholder_hour)));
  if (typeof patch.industry_intel_day === 'number')
    clean.industry_intel_day = Math.min(6, Math.max(0, Math.round(patch.industry_intel_day)));
  if (typeof patch.industry_intel_hour === 'number')
    clean.industry_intel_hour = Math.min(23, Math.max(0, Math.round(patch.industry_intel_hour)));
  for (const key of ['slack_template_new_company', 'slack_template_new_title', 'slack_template_new_stakeholder'] as const) {
    const v = patch[key];
    if (typeof v === 'string' && v.trim()) clean[key] = v.trim().slice(0, 1500);
  }
  if (typeof patch.signal_company_change_enabled === 'boolean')
    clean.signal_company_change_enabled = patch.signal_company_change_enabled;
  if (typeof patch.signal_title_change_enabled === 'boolean')
    clean.signal_title_change_enabled = patch.signal_title_change_enabled;
  const SEVERITIES = ['critical', 'warning', 'info'] as const;
  for (const key of ['signal_company_change_severity', 'signal_title_change_severity', 'signal_new_stakeholder_severity'] as const) {
    const v = patch[key];
    if (typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v)) {
      clean[key] = v as (typeof SEVERITIES)[number];
    }
  }
  if (typeof patch.title_equivalences === 'string') clean.title_equivalences = patch.title_equivalences.slice(0, 2000);

  const c = await coll('workspace_settings');
  await c.updateOne(
    { key: KEY },
    { $set: { ...clean, updated_at: new Date().toISOString(), updated_by: updatedBy } },
    { upsert: true }
  );
  return getWorkspaceSettings();
}
