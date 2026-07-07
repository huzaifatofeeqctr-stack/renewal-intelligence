import { requireUser } from '@/lib/require-user';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';

const INTEGRATIONS: { name: string; envVar: string }[] = [
  { name: 'MongoDB', envVar: 'MONGODB_URI' },
  { name: 'Salesforce', envVar: 'SF_CLIENT_ID' },
  { name: 'LeadIQ', envVar: 'LEADIQ_API_KEY' },
  { name: 'Clay webhook', envVar: 'CLAY_WEBHOOK_URL' },
  { name: 'Tavily', envVar: 'TAVILY_API_KEY' },
  { name: 'Anthropic', envVar: 'ANTHROPIC_API_KEY' },
  { name: 'Slack alerts', envVar: 'SLACK_WEBHOOK_URL' },
];

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <main>
      <h1>Settings</h1>
      <p className="subtitle">Your preferences and the workspace integration status.</p>
      <div className="stack">
        <SettingsForm initial={user.settings} />
        <div className="panel">
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
