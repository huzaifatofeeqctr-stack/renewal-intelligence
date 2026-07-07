'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Settings {
  email_alerts: boolean;
  weekly_digest: boolean;
  default_view: 'accounts' | 'signals' | 'contacts';
}

export default function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(initial);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(next: Settings) {
    setSettings(next);
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: next }),
    });
    if (res.ok) {
      setMessage({ kind: 'ok', text: 'Settings saved' });
      router.refresh();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage({ kind: 'error', text: data.error ?? 'Something went wrong' });
    }
    setBusy(false);
  }

  return (
    <div className="panel">
      <h2>Notifications & preferences</h2>
      <div className="settings-rows">
        <label className="setting-row">
          <span>
            <strong>Signal email alerts</strong>
            <small>Receive an email when a critical signal fires on one of your accounts</small>
          </span>
          <input
            type="checkbox"
            checked={settings.email_alerts}
            disabled={busy}
            onChange={(e) => save({ ...settings, email_alerts: e.target.checked })}
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Weekly digest</strong>
            <small>Monday summary of all signals and enrichment activity</small>
          </span>
          <input
            type="checkbox"
            checked={settings.weekly_digest}
            disabled={busy}
            onChange={(e) => save({ ...settings, weekly_digest: e.target.checked })}
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Default view</strong>
            <small>The page you land on after signing in</small>
          </span>
          <select
            value={settings.default_view}
            disabled={busy}
            onChange={(e) =>
              save({ ...settings, default_view: e.target.value as Settings['default_view'] })
            }
          >
            <option value="accounts">Accounts</option>
            <option value="signals">Signals</option>
            <option value="contacts">Contacts</option>
          </select>
        </label>
      </div>
      {message && <div className={message.kind === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</div>}
    </div>
  );
}
