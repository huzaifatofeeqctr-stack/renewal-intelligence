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

export default async function SettingsPage() {
  const user = await requireUser();
  const workspace = user.role === 'admin' ? await getWorkspaceSettings() : null;

  return (
    <main className="settings-layout">
      <aside className="settings-menu">
        <h1>Settings</h1>
        {workspace && (
          <>
            <a href="#workspace">Sync &amp; enrichment</a>
            <a href="#signal-rules">Signal rules</a>
            <a href="#schedule">Schedule</a>
            <a href="#slack-templates">Slack templates</a>
            <a href="#run-now">Run now</a>
          </>
        )}
        <a href="#preferences">My preferences</a>
        <a href="#integrations">Integrations</a>
        <Link href="/profile">Profile →</Link>
      </aside>

      <div className="settings-content stack">
        {workspace && <WorkspacePanel initial={workspace} />}
        <div id="preferences">
          <SettingsForm initial={user.settings} />
        </div>
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
      </div>
    </main>
  );
}
