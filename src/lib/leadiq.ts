// LeadIQ Champion Tracking client.
// NOTE: the /v2/champion-tracking/* paths are pending confirmation against the
// LeadIQ Data API docs (design-doc open question #1). The response parser
// tolerates several payload shapes until the contract is pinned down.

export interface LeadIqChange {
  contactSfdcId: string;
  contactName: string;
  email: string;
  changeType: 'new_company' | 'new_title';
  previousValue: string;
  newValue: string;
  detectedAt: string;
}

function baseUrl(): string {
  return process.env.LEADIQ_BASE_URL ?? 'https://api.leadiq.com';
}

function headers(): Record<string, string> {
  const key = process.env.LEADIQ_API_KEY;
  if (!key) throw new Error('LEADIQ_API_KEY must be set');
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

export async function syncTrackedContacts(
  contacts: { sfdcId: string; name: string; email: string; company: string }[]
): Promise<void> {
  const res = await fetch(`${baseUrl()}/v2/champion-tracking/contacts`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      contacts: contacts.map((c) => ({
        externalId: c.sfdcId,
        fullName: c.name,
        email: c.email,
        companyName: c.company,
      })),
    }),
  });
  if (!res.ok) {
    // Sync failure shouldn't block polling for changes on already-tracked contacts.
    console.error('LeadIQ contact sync failed:', res.status, await res.text());
  }
}

export async function fetchChanges(sinceIso: string): Promise<LeadIqChange[]> {
  const res = await fetch(
    `${baseUrl()}/v2/champion-tracking/changes?since=${encodeURIComponent(sinceIso)}`,
    { headers: headers() }
  );
  if (!res.ok) {
    throw new Error(`LeadIQ changes fetch failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  const raw = (Array.isArray(body) ? body : body.changes ?? body.data ?? body.results ?? []) as Record<
    string,
    unknown
  >[];

  return raw.map((ch) => {
    const str = (k: string) => (typeof ch[k] === 'string' ? (ch[k] as string) : '');
    const rawType = (str('change_type') || str('changeType')).toLowerCase();
    const newCompany = str('new_company') || str('newCompany');
    const prevCompany = str('previous_company') || str('previousCompany');
    const isCompanyChange =
      rawType.includes('company') || (!!newCompany && newCompany !== prevCompany);
    return {
      contactSfdcId: str('external_id') || str('externalId'),
      contactName: str('name') || str('fullName'),
      email: (str('email') || str('previous_email')).toLowerCase(),
      changeType: isCompanyChange ? 'new_company' : 'new_title',
      previousValue: isCompanyChange
        ? prevCompany
        : str('previous_title') || str('previousTitle'),
      newValue: isCompanyChange ? newCompany : str('new_title') || str('newTitle'),
      detectedAt: str('detected_at') || str('detectedAt') || new Date().toISOString(),
    };
  });
}
