import Link from 'next/link';
import { requireUser } from '@/lib/require-user';
import { getWorkspaceSettings } from '@/lib/workspace';
import SettingsForm from './SettingsForm';
import WorkspacePanel from './WorkspacePanel';

export const dynamic = 'force-dynamic';

const INTEGRATIONS: { name: string; envVar: string }[] = [
  { name: 'MongoDB', envVar: 'MONGODB_URI' },
  { name: 'Salesforce (read-only)', envVar: 'SF_CLIENT_ID' },
  { name: 'Apollo', envVar: 'APOLLO_API_KEY' },
  { name: 'Tavily', envVar: 'TAVILY_API_KEY' },
  { name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { name: 'Slack alerts', envVar: 'SLACK_WEBHOOK_URL' },
];

const ADMIN_TABS: { key: string; label: string }[] = [
  { key: 'workspace', label: 'Sync & enrichment' },
  { key: 'signal-rules', label: 'Signal rules' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'slack-templates', label: 'Slack templates' },
];

const COMMON_TABS: { key: string; label: string }[] = [
  { key: 'preferences', label: 'My preferences' },
  { key: 'integrations', label: 'Integrations' },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const user = await requireUser();
  const isAdmin = user.role === 'admin';
  const workspace = isAdmin ? await getWorkspaceSettings() : null;

  const tabs = [...(isAdmin ? ADMIN_TABS : []), ...COMMON_TABS];
  const requested = typeof searchParams.tab === 'string' ? searchParams.tab : '';
  const tab = tabs.some((t) => t.key === requested) ? requested : tabs[0].key;

  return (
    <main className="settings-layout">
      <aside className="settings-menu">
        <h1>Settings</h1>
        {tabs.map((t) => (
          <Link key={t.key} href={`/settings?tab=${t.key}`} className={tab === t.key ? 'active' : ''}>
            {t.label}
          </Link>
        ))}
        <Link href="/profile">Profile →</Link>
      </aside>

      <div className="settings-content stack">
        {workspace && ADMIN_TABS.some((t) => t.key === tab) && (
          <WorkspacePanel initial={workspace} section={tab} />
        )}

        {tab === 'preferences' && <SettingsForm initial={user.settings} />}

        {tab === 'integrations' && (
          <div className="panel" id="integrations">
            <h2>Integrations</h2>
            <p className="subtitle">Configured via environment variables on the deployment.</p>
            <div className="settings-rows">
              {INTEGRATIONS.map((i) => {
                const configured = Boolean(process.env[i.envVar]);
                return (
                  <div className="setting-row" key={i.envVar}>
                    <span>
                      <strong>{i.name}</strong>
                      <small>{i.envVar}</small>
                    </span>
                    <span className={`badge ${configured ? 'ok' : 'muted'}`}>
                      {configured ? 'connected' : 'not configured'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
