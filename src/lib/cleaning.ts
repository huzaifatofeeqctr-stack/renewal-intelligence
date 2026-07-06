const ROLE_PREFIXES = new Set([
  'info', 'support', 'sales', 'hello', 'admin', 'contact', 'noreply',
  'no-reply', 'billing', 'help', 'team', 'office', 'marketing',
  'webmaster', 'postmaster',
]);

const PLACEHOLDER_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'example.com', 'test.com', 'yopmail.com',
]);

const INTERNAL_DOMAINS = new Set(['postscript.io']);

const PLACEHOLDER_NAMES = new Set([
  'test', 'unknown', 'n/a', 'tbd', 'na', 'none', 'placeholder', 'x', 'xx',
]);

export interface JunkVerdict {
  isJunk: boolean;
  reason: string | null;
}

export function junkCheck(input: {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): JunkVerdict {
  const email = (input.email ?? '').toLowerCase().trim();
  const first = (input.firstName ?? '').toLowerCase().trim();
  const last = (input.lastName ?? '').toLowerCase().trim();

  if (!email && !first && !last) return { isJunk: true, reason: 'no_identity' };

  if (email) {
    const [prefix = '', domain = ''] = email.split('@');
    if (ROLE_PREFIXES.has(prefix)) return { isJunk: true, reason: 'role_mailbox' };
    if (PLACEHOLDER_DOMAINS.has(domain)) return { isJunk: true, reason: 'placeholder_domain' };
    if (INTERNAL_DOMAINS.has(domain)) return { isJunk: true, reason: 'internal_staff' };
  }

  if (PLACEHOLDER_NAMES.has(first) && PLACEHOLDER_NAMES.has(last)) {
    return { isJunk: true, reason: 'placeholder_name' };
  }

  return { isJunk: false, reason: null };
}
