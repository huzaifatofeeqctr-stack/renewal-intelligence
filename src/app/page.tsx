import { supabase } from '@/lib/supabase';
import type { AccountRow, SignalRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface AccountCard extends AccountRow {
  critical: number;
  warning: number;
  info: number;
  computedScore: number;
}

async function loadAccounts(): Promise<AccountCard[]> {
  const db = supabase();
  const [{ data: accounts }, { data: signals }] = await Promise.all([
    db.from('accounts').select('*'),
    db.from('signals').select('account_id, severity, dismissed').eq('dismissed', false),
  ]);

  const counts = new Map<string, { critical: number; warning: number; info: number }>();
  for (const s of (signals ?? []) as Pick<SignalRow, 'account_id' | 'severity' | 'dismissed'>[]) {
    if (!s.account_id) continue;
    const c = counts.get(s.account_id) ?? { critical: 0, warning: 0, info: 0 };
    c[s.severity]++;
    counts.set(s.account_id, c);
  }

  return ((accounts ?? []) as AccountRow[])
    .map((a) => {
      const c = counts.get(a.id) ?? { critical: 0, warning: 0, info: 0 };
      const computedScore = Math.max(0, 100 - c.critical * 40 - c.warning * 15 - c.info * 5);
      return { ...a, ...c, computedScore };
    })
    .sort((a, b) => a.computedScore - b.computedScore || b.critical - a.critical);
}

function scoreClass(score: number): string {
  if (score >= 80) return 'good';
  if (score >= 50) return 'mid';
  return 'bad';
}

export default async function AccountsPage() {
  let accounts: AccountCard[] = [];
  let loadError: string | null = null;
  try {
    accounts = await loadAccounts();
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  return (
    <main>
      <h1>Accounts</h1>
      <p className="subtitle">Sorted by CRM health — accounts with open critical signals first.</p>
      {loadError ? (
        <div className="empty">
          Could not reach Supabase ({loadError}). Set SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY and run the sf-sync cron.
        </div>
      ) : accounts.length === 0 ? (
        <div className="empty">No accounts yet — run /api/cron/sf-sync to pull them from Salesforce.</div>
      ) : (
        <div className="grid">
          {accounts.map((a) => (
            <div className="card" key={a.id}>
              <span className={`score ${scoreClass(a.computedScore)}`}>{a.computedScore}</span>
              <h3>{a.name}</h3>
              <div className="meta">
                {a.industry ?? 'No industry'} · {a.owner_email ?? 'unassigned'}
                {a.renewal_date ? ` · renews ${a.renewal_date}` : ''}
              </div>
              <div className="badges">
                {a.critical > 0 && <span className="badge critical">{a.critical} critical</span>}
                {a.warning > 0 && <span className="badge warning">{a.warning} warning</span>}
                {a.info > 0 && <span className="badge info">{a.info} info</span>}
                {a.critical + a.warning + a.info === 0 && <span className="badge ok">healthy</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
