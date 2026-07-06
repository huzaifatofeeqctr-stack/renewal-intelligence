// Clay integration is webhook-in / webhook-out:
// dispatch POSTs contacts to a Clay table's Webhook source; a Clay HTTP-API
// column POSTs enriched rows back to /api/webhooks/clay-callback.

export interface ClayDispatchContact {
  contact_id: string;
  first_name: string;
  last_name: string;
  email: string;
  title: string;
  company_name: string;
  company_domain: string;
}

export async function dispatchToClay(contact: ClayDispatchContact): Promise<boolean> {
  const url = process.env.CLAY_WEBHOOK_URL;
  if (!url) throw new Error('CLAY_WEBHOOK_URL must be set');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact),
  });
  if (!res.ok) {
    console.error('Clay dispatch failed:', res.status, await res.text());
    return false;
  }
  return true;
}

export interface ClayCallbackPayload {
  contact_id: string;
  work_email: string;
  email_valid: 'valid' | 'invalid' | 'risky' | 'unknown';
  personal_email: string;
  linkedin_url: string;
  title: string;
  provider_used: string;
}

export function parseClayCallback(body: Record<string, unknown>): ClayCallbackPayload | null {
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : '');
  const contactId = str('contact_id');
  if (!contactId) return null;
  const validity = str('email_valid');
  return {
    contact_id: contactId,
    work_email: str('work_email'),
    email_valid: (['valid', 'invalid', 'risky'].includes(validity) ? validity : 'unknown') as ClayCallbackPayload['email_valid'],
    personal_email: str('personal_email'),
    linkedin_url: str('linkedin_url'),
    title: str('title'),
    provider_used: str('provider_used') || 'clay',
  };
}
