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
};

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

  const c = await coll('workspace_settings');
  await c.updateOne(
    { key: KEY },
    { $set: { ...clean, updated_at: new Date().toISOString(), updated_by: updatedBy } },
    { upsert: true }
  );
  return getWorkspaceSettings();
}
