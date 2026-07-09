// Salesforce client — STRICTLY READ-ONLY.
// Policy (2026-07-09): this app never writes to Salesforce. Only SOQL reads.
// Signals, enrichment results, and all derived data live in MongoDB only.

interface SfToken {
  access_token: string;
  instance_url: string;
  expiresAt: number;
}

let cachedToken: SfToken | null = null;

async function getToken(): Promise<SfToken> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken;

  const instanceUrl = process.env.SF_INSTANCE_URL;
  const clientId = process.env.SF_CLIENT_ID;
  const clientSecret = process.env.SF_CLIENT_SECRET;
  if (!instanceUrl || !clientId || !clientSecret) {
    throw new Error('SF_INSTANCE_URL, SF_CLIENT_ID and SF_CLIENT_SECRET must be set');
  }

  const res = await fetch(`${instanceUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`Salesforce token request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; instance_url: string };
  cachedToken = {
    access_token: data.access_token,
    instance_url: data.instance_url || instanceUrl,
    expiresAt: Date.now() + 25 * 60 * 1000,
  };
  return cachedToken;
}

async function sfFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  return fetch(`${token.instance_url}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

export async function soql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const records: T[] = [];
  let path: string | null = `/services/data/v60.0/query?q=${encodeURIComponent(query)}`;
  while (path) {
    const res = await sfFetch(path);
    if (!res.ok) throw new Error(`SOQL failed: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as {
      records: T[];
      done: boolean;
      nextRecordsUrl?: string;
    };
    records.push(...page.records);
    path = page.done ? null : page.nextRecordsUrl ?? null;
  }
  return records;
}
