'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setMessage({ kind: 'ok', text: okText });
      router.refresh();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage({ kind: 'error', text: data.error ?? 'Something went wrong' });
    }
    setBusy(false);
  }

  return (
    <div className="stack">
      <div className="panel">
        <h2>Display name</h2>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            patch({ name }, 'Name updated');
          }}
        >
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
          <button className="btn-primary" disabled={busy} type="submit">
            Save name
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Change password</h2>
        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            patch({ current_password: currentPassword, new_password: newPassword }, 'Password changed');
            setCurrentPassword('');
            setNewPassword('');
          }}
        >
          <label>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </label>
          <button className="btn-primary" disabled={busy} type="submit">
            Change password
          </button>
        </form>
      </div>

      {message && <div className={message.kind === 'ok' ? 'form-ok' : 'form-error'}>{message.text}</div>}
    </div>
  );
}
