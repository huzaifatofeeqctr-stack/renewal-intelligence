// Apollo.io client — the app's single enrichment/intelligence provider.
// Search (mixed_people/api_search) is free; match (people/match) reveals the
// full record and consumes 1 credit, so every match call sits behind a budget.

const BASE = 'https://api.apollo.io/api/v1';

function headers(): Record<string, string> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error('APOLLO_API_KEY must be set');
  return { 'x-api-key': key, 'Content-Type': 'application/json' };
}

// ── adaptive rate limiting ────────────────────────────────────────────────
// Apollo returns per-minute/hour/day quota headers on every response; pacing
// adapts to what's actually left instead of a fixed sleep.

let minuteLeft: number | null = null;
let hourLeft: number | null = null;

function readRateHeaders(res: Response): void {
  const minute = res.headers.get('x-minute-requests-left') ?? res.headers.get('x-rate-limit-remaining');
  const hourly = res.headers.get('x-hourly-requests-left');
  if (minute != null && minute !== '') minuteLeft = Number(minute);
  if (hourly != null && hourly !== '') hourLeft = Number(hourly);
}

// How long to wait before the NEXT Apollo call. With no header data, fall
// back to the caller's default. Nearly-exhausted minute window → wait it out.
export function apolloPaceMs(defaultMs = 1500): number {
  if (hourLeft !== null && hourLeft <= 1) return 5 * 60 * 1000; // hourly cap hit — long pause
  if (minuteLeft === null || Number.isNaN(minuteLeft)) return defaultMs;
  if (minuteLeft <= 1) return 61 * 1000; // let the minute window reset
  return Math.max(250, Math.min(defaultMs * 4, Math.ceil(60000 / minuteLeft)));
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
  readRateHeaders(res);
  if (!res.ok) throw new Error(`Apollo search failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { people?: Record<string, unknown>[] };
  return (data.people ?? []).map((p) => ({
    id: String(p.id ?? ''),
    first_name: String(p.first_name ?? ''),
    title: String(p.title ?? ''),
    has_email: Boolean(p.has_email),
  }));
}

export interface ApolloEmployment {
  org_name: string;
  title: string;
  current: boolean;
}

export interface ApolloPerson {
  name: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  email_status: string; // 'verified' | 'guessed' | ...
  linkedin_url: string;
  org_name: string; // Apollo's PRIMARY org guess — people can hold several current roles
  org_domain: string;
  employment: ApolloEmployment[]; // full history; the source of truth for "still there?"
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
  readRateHeaders(res);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Apollo match failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { person?: Record<string, unknown> | null };
  const p = data.person;
  if (!p) return null;
  const org = (p.organization ?? {}) as Record<string, unknown>;
  const orgUrl = String(org.website_url ?? '');
  const history = (Array.isArray(p.employment_history) ? p.employment_history : []) as Record<
    string,
    unknown
  >[];
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
    employment: history.map((e) => ({
      org_name: String(e.organization_name ?? ''),
      title: String(e.title ?? ''),
      current: e.current === true || e.end_date == null,
    })),
  };
}

// ── normalization helpers for signal quality ─────────────────────────────

function normalizeOrgName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|co|corp|company|the)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// "SolaceBands" ≈ "Solace Bands"; "ButcherBox" ≈ "butcherbox.ca"
export function orgNamesMatch(a: string, b: string): boolean {
  const na = normalizeOrgName(a);
  const nb = normalizeOrgName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

const TITLE_EXPANSIONS: [RegExp, string][] = [
  [/\bcmo\b/g, 'chief marketing officer'],
  [/\bceo\b/g, 'chief executive officer'],
  [/\bcoo\b/g, 'chief operating officer'],
  [/\bcfo\b/g, 'chief financial officer'],
  [/\bcto\b/g, 'chief technology officer'],
  [/\bsvp\b/g, 'senior vice president'],
  [/\bevp\b/g, 'executive vice president'],
  [/\bvp\b/g, 'vice president'],
  [/\bdir\b/g, 'director'],
  [/\bmktg\b/g, 'marketing'],
  [/\becomm?\b/g, 'ecommerce'],
];

function normalizeTitle(title: string): string {
  let t = title.toLowerCase().replace(/&/g, ' and ');
  for (const [re, full] of TITLE_EXPANSIONS) t = t.replace(re, full);
  return t
    .replace(/\b(co)[\s-]?founder\b/g, 'founder') // co-founder ≈ founder
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Only a REAL title change should signal — formatting variants must not.
// `extraEquivalences`: workspace-configured lines of "Title A = Title B".
export function titlesEquivalent(a: string, b: string, extraEquivalences?: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return true; // nothing to compare — don't signal on blanks
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  if (extraEquivalences) {
    for (const line of extraEquivalences.split('\n')) {
      const [left, right] = line.split('=').map((p) => normalizeTitle(p ?? ''));
      if (!left || !right) continue;
      if ((na === left && nb === right) || (na === right && nb === left)) return true;
    }
  }
  return false;
}

export function domainsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

// The person's current role AT this account, if any — checked against the
// full employment history so concurrent roles elsewhere don't cause false
// "left the company" signals.
export function currentRoleAtAccount(
  person: ApolloPerson,
  accountDomain: string,
  accountName: string
): ApolloEmployment | null {
  const currents = person.employment.filter((e) => e.current);
  const byHistory = currents.find((e) => orgNamesMatch(e.org_name, accountName));
  if (byHistory) return byHistory;
  if (domainsMatch(person.org_domain, accountDomain) || orgNamesMatch(person.org_name, accountName)) {
    return { org_name: person.org_name, title: person.title, current: true };
  }
  return null;
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
