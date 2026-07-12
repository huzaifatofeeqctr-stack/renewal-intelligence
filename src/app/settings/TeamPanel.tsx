'use client';

import { useEffect, useState } from 'react';

interface TeamUser {
  email: string;
  name: string;
  role: 'admin' | 'member';
  created_at: string;
}

// Admin-only: who's in the workspace and who can edit global settings.
export default function TeamPanel({ selfEmail }: { selfEmail: string }) {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch('/api/users');
    if (res.ok) setUsers(((await res.json()) as { users: TeamUser[] }).users);
    else setMessage('Could not load users');
  }
  useEffect(() => {
    void load();
  }, []);

  async function setRole(email: string, role: 'admin' | 'member') {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setMessage(res.ok ? `${email} is now ${role === 'admin' ? 'an admin' : 'a member'}` : data.error ?? 'Update failed');
    await load();
    setBusy(false);
  }

  return (
    <div className="panel" id="team">
      <h2>Team</h2>
      <p className="subtitle">
        Admins can edit all workspace settings; members see them read-only. The first account created became admin
        automatically.
      </p>
      {message && <div className="form-ok">{message}</div>}
      {users === null ? (
        <div className="empty">Loading…</div>
      ) : (
        <div className="settings-rows">
          {users.map((u) => (
            <div className="setting-row" key={u.email}>
              <span>
                <strong>
                  {u.name} {u.email === selfEmail && <span className="badge muted">you</span>}
                </strong>
                <small>{u.email} · joined {new Date(u.created_at).toLocaleDateString()}</small>
              </span>
              {u.email === selfEmail ? (
                <span className={`badge ${u.role === 'admin' ? 'info' : 'muted'}`}>{u.role}</span>
              ) : (
                <select
                  value={u.role}
                  disabled={busy}
                  onChange={(e) => setRole(u.email, e.target.value as 'admin' | 'member')}
                >
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </select>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
