// Apollo.io client — the app's single enrichment/intelligence provider.
// Search (mixed_people/api_search) is free; match (people/match) reveals the
// full record and consumes 1 credit, so every match call sits behind a budget.

const BASE = 'https://api.apollo.io/api/v1';

function headers(): Record<string, string> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY must be set');
  return { 'x-api-key': key, 'Content-Type': 'application/json' };
}

export const DEFAULT_ICP_TITLES = [
  'Chief Marketing Officer',
  'CMO',
  'VP Marketing',
  'VP Ecommerce',
  'VP of Digital',
  'Director of Ecommerce',
  'Head of Retention',
  'Director of Retention',
  'Director of Lifecycle',
];

export function icpTitles(): string[] {
  const env = process.env.APOLLO_ICP_TITLES;
  if (!env) return DEFAULT_ICP_TITLES;
  return env.split(',').map((t) => t.trim()).filter(Boolean);
}

export interface ApolloSearchHit {
  id: string;
  first_name: string;
  title: string;
  has_email: boolean;
}

export async function searchPeopleByDomain(domain: string, titles: string[]): Promise<ApolloSearchHit[]> {
  const res = await fetch(`${BASE}/mixed_people/api_search`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      q_organization_domains_list: [domain],
      person_titles: titles,
      page: 1,
      per_page: 10,
    }),
  });
  if (!res.ok) throw new Error(`Apollo search failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { people?: Record<string, unknown>[] };
  return (data.people ?? []).map((p) => ({
    id: String(p.id ?? ''),
    first_name: String(p.first_name ?? ''),
    title: String(p.title ?? ''),
    has_email: Boolean(p.has_email),
  }));
}

export interface ApolloPerson {
  name: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  email_status: string; // 'verified' | 'guessed' | ...
  linkedin_url: string;
  org_name: string;
  org_domain: string;
}

// Reveals a full person record — consumes 1 Apollo credit per call.
export async function matchPerson(query: {
  id?: string;
  firstName?: string;
  lastName?: string;
  domain?: string;
  email?: string;
}): Promise<ApolloPerson | null> {
  const body: Record<string, unknown> = {};
  if (query.id) body.id = query.id;
  if (query.firstName) body.first_name = query.firstName;
  if (query.lastName) body.last_name = query.lastName;
  if (query.domain) body.domain = query.domain;
  if (query.email) body.email = query.email;

  const res = await fetch(`${BASE}/people/match?reveal_personal_emails=false`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Apollo match failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { person?: Record<string, unknown> | null };
  const p = data.person;
  if (!p) return null;
  const org = (p.organization ?? {}) as Record<string, unknown>;
  const orgUrl = String(org.website_url ?? '');
  return {
    name: String(p.name ?? ''),
    first_name: String(p.first_name ?? ''),
    last_name: String(p.last_name ?? ''),
    title: String(p.title ?? ''),
    email: String(p.email ?? ''),
    email_status: String(p.email_status ?? ''),
    linkedin_url: String(p.linkedin_url ?? ''),
    org_name: String(org.name ?? ''),
    org_domain: orgUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''),
  };
}

export function normalizeDomain(website: string | null | undefined): string {
  if (!website) return '';
  return website
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^checkout\./, '')
    .replace(/^shop\./, '')
    .replace(/\/.*$/, '')
    .trim();
}
