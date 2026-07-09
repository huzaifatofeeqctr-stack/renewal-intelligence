import { describe, it, expect } from 'vitest';
import { junkCheck } from '../cleaning';

describe('junkCheck', () => {
  it('flags role mailboxes', () => {
    expect(junkCheck({ email: 'info@lolablankets.com', firstName: 'Lola', lastName: 'Info' })).toEqual({
      isJunk: true,
      reason: 'role_mailbox',
    });
    expect(junkCheck({ email: 'support@butcherbox.com' }).isJunk).toBe(true);
  });

  it('flags placeholder domains and internal staff', () => {
    expect(junkCheck({ email: 'jane@example.com' }).reason).toBe('placeholder_domain');
    expect(junkCheck({ email: 'someone@postscript.io' }).reason).toBe('internal_staff');
  });

  it('flags placeholder names only when BOTH names are placeholders', () => {
    expect(junkCheck({ firstName: 'Test', lastName: 'Unknown' }).reason).toBe('placeholder_name');
    expect(junkCheck({ firstName: 'Test', lastName: 'Held' }).isJunk).toBe(false);
  });

  it('flags contacts with no identity at all', () => {
    expect(junkCheck({}).reason).toBe('no_identity');
    expect(junkCheck({ email: null, firstName: '', lastName: null }).reason).toBe('no_identity');
  });

  it('passes real people through', () => {
    expect(junkCheck({ email: 'chad.held@solacebands.com', firstName: 'Chad', lastName: 'Held' })).toEqual({
      isJunk: false,
      reason: null,
    });
  });
});
