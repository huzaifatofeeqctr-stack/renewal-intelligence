'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'signup' ? { email, name, password } : { email, password }),
    });
    if (res.ok) {
      router.push('/');
      router.refresh();
      return;
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(data.error ?? 'Something went wrong');
    setBusy(false);
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {mode === 'signup' && (
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required />
        </label>
      )}
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
          required
          minLength={mode === 'signup' ? 8 : undefined}
        />
      </label>
      {error && <div className="form-error">{error}</div>}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
      </button>
    </form>
  );
}
