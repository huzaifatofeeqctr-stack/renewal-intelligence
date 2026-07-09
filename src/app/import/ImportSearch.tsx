'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface SfResult {
  sfdc_id: string;
  name: string;
  website: string | null;
  industry: string | null;
  owner_email: string | null;
  tracked: boolean;
}

export default function ImportSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SfResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/sf/search?q=${encodeURIComponent(q)}`);
    const data = (await res.json().catch(() => ({}))) as { results?: SfResult[]; error?: string };
    if (res.ok && data.results) {
      setResults(data.results);
    } else {
      setMessage(data.error ?? 'Search failed');
      setResults(null);
    }
    setBusy(false);
  }

  async function importAccount(r: SfResult) {
    setImporting(r.sfdc_id);
    setMessage(null);
    const res = await fetch('/api/sf/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: r.sfdc_id }),
    });
    const data = (await res.json().catch(() => ({}))) as { contacts?: number; junk?: number; error?: string };
    if (res.ok) {
      setMessage(`Imported ${r.name}: ${data.contacts ?? 0} contacts (${data.junk ?? 0} junk-flagged).`);
      setResults((prev) => prev?.map((x) => (x.sfdc_id === r.sfdc_id ? { ...x, tracked: true } : x)) ?? null);
      router.refresh();
    } else {
      setMessage(data.error ?? 'Import failed');
    }
    setImporting(null);
  }

  return (
    <div>
      <form className="toolbar" onSubmit={search}>
        <input
          type="search"
          className="search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Salesforce accounts by name…"
          minLength={2}
          required
        />
        <button type="submit" className="btn-secondary" disabled={busy}>
          {busy ? 'Searching…' : 'Search Salesforce'}
        </button>
      </form>

      {message && <div className="form-ok" style={{ marginBottom: 14 }}>{message}</div>}

      {results && results.length === 0 && <div className="empty">No Salesforce accounts match “{q}”.</div>}

      {results && results.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Website</th>
              <th>Industry</th>
              <th>Owner</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.sfdc_id}>
                <td>{r.name}</td>
                <td>{r.website ?? '—'}</td>
                <td>{r.industry ?? '—'}</td>
                <td>{r.owner_email ?? '—'}</td>
                <td>
                  {r.tracked ? (
                    <span className="badge ok">tracked</span>
                  ) : (
                    <button
                      className="btn-secondary"
                      disabled={importing === r.sfdc_id}
                      onClick={() => importAccount(r)}
                    >
                      {importing === r.sfdc_id ? 'Importing…' : 'Import'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
