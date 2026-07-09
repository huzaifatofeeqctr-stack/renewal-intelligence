import { coll } from '@/lib/db';
import { requireUser } from '@/lib/require-user';
import type { AccountDoc, SignalDoc } from '@/lib/types';
import { SearchBar, Pagination, parsePage, escapeRegex } from './ListControls';
import AccountsGrid from './AccountsGrid';
import RunNowBar from './RunNowBar';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

interface AccountCard extends AccountDoc {
  critical: number;
  warning: number;
  info: number;
  computedScore: number;
}

async function loadAccounts(q: string): Promise<AccountCard[]> {
  const filter = q
    ? {
        $or: [
          { name: { $regex: escapeRegex(q), $options: 'i' } },
          { industry: { $regex: escapeRegex(q), $options: 'i' } },
          { owner_email: { $regex: escapeRegex(q), $options: 'i' } },
          { website: { $regex: escapeRegex(q), $options: 'i' } },
        ],
      }
    : {};

  const [accounts, signals] = await Promise.all([
    coll<AccountDoc>('accounts').then((c) => c.find(filter).limit(5000).toArray()),
    coll<SignalDoc>('signals').then((c) =>
      c
        .find({ dismissed: false })
        .project<Pick<SignalDoc, 'account_sfdc_id' | 'severity'>>({ account_sfdc_id: 1, severity: 1 })
        .toArray()
    ),
  ]);

  const counts = new Map<string, { critical: number; warning: number; info: number }>();
  for (const s of signals) {
    if (!s.account_sfdc_id) continue;
    const c = counts.get(s.account_sfdc_id) ?? { critical: 0, warning: 0, info: 0 };
    c[s.severity]++;
    counts.set(s.account_sfdc_id, c);
  }

  return accounts
    .map((a) => {
      const c = counts.get(a.sfdc_id) ?? { critical: 0, warning: 0, info: 0 };
      const computedScore = Math.max(0, 100 - c.critical * 40 - c.warning * 15 - c.info * 5);
      return { ...a, ...c, computedScore };
    })
    .sort((a, b) => a.computedScore - b.computedScore || b.critical - a.critical || a.name.localeCompare(b.name));
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const user = await requireUser();
  const { q, page } = parsePage(searchParams);

  let all: AccountCard[] = [];
  let loadError: string | null = null;
  try {
    all = await loadAccounts(q);
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'failed to load';
  }

  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = all.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p className="subtitle">Sorted by CRM health — accounts with open critical signals first.</p>
        </div>
        {user.role === 'admin' && <RunNowBar />}
      </div>
      <SearchBar basePath="/" q={q} placeholder="Search by account, industry, owner, or domain…" />
      {loadError ? (
        <div className="empty">Could not reach MongoDB ({loadError}).</div>
      ) : all.length === 0 ? (
        <div className="empty">
          {q ? `No accounts match “${q}”.` : 'No accounts yet — run /api/cron/sf-sync to pull them from Salesforce.'}
        </div>
      ) : (
        <>
          <AccountsGrid
            accounts={visible.map((a) => ({
              sfdc_id: a.sfdc_id,
              name: a.name,
              industry: a.industry,
              owner_email: a.owner_email,
              renewal_date: a.renewal_date,
              website: a.website,
              critical: a.critical,
              warning: a.warning,
              info: a.info,
              computedScore: a.computedScore,
            }))}
          />
          <Pagination basePath="/" q={q} page={current} totalPages={totalPages} totalItems={all.length} />
        </>
      )}
    </main>
  );
}
