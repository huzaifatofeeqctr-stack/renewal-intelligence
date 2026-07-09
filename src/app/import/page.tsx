import { requireUser } from '@/lib/require-user';
import ImportSearch from './ImportSearch';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  await requireUser();
  return (
    <main>
      <h1>Import from Salesforce</h1>
      <p className="subtitle">
        Search your Salesforce accounts and import the ones this workspace should track. Imported accounts (and all
        their contacts) refresh automatically on the daily sync and are eligible for enrichment and stakeholder
        discovery.
      </p>
      <ImportSearch />
    </main>
  );
}
