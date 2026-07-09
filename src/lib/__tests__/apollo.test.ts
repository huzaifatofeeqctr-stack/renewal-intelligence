import { describe, it, expect } from 'vitest';
import {
  titlesEquivalent,
  orgNamesMatch,
  normalizeDomain,
  domainsMatch,
  currentRoleAtAccount,
  apolloPaceMs,
  type ApolloPerson,
} from '../apollo';

describe('titlesEquivalent', () => {
  it('treats abbreviation variants as the same title', () => {
    expect(titlesEquivalent('CMO', 'Chief Marketing Officer')).toBe(true);
    expect(titlesEquivalent('VP Marketing', 'Vice President, Marketing')).toBe(true);
    expect(titlesEquivalent('Dir of Ecomm', 'Director of Ecommerce')).toBe(true);
  });

  it('treats co-founder and founder as equivalent', () => {
    expect(titlesEquivalent('Co-Founder', 'Founder')).toBe(true);
    expect(titlesEquivalent('Cofounder & CEO', 'Founder and Chief Executive Officer')).toBe(true);
  });

  it('uses containment so a more specific title does not signal', () => {
    expect(titlesEquivalent('VP Marketing', 'Senior Vice President Marketing')).toBe(true);
  });

  it('detects a genuine title change', () => {
    expect(titlesEquivalent('Director of Retention', 'Chief Marketing Officer')).toBe(false);
  });

  it('never signals on blank titles', () => {
    expect(titlesEquivalent('', 'CMO')).toBe(true);
  });

  it('honors workspace-configured equivalences', () => {
    const extra = 'Head of Growth = VP Growth\nOwner = Founder';
    expect(titlesEquivalent('Head of Growth', 'VP Growth', extra)).toBe(true);
    expect(titlesEquivalent('Owner', 'Founder', extra)).toBe(true);
    expect(titlesEquivalent('Head of Growth', 'CFO', extra)).toBe(false);
  });
});

describe('orgNamesMatch', () => {
  it('ignores spacing, punctuation, and legal suffixes', () => {
    expect(orgNamesMatch('SolaceBands', 'Solace Bands')).toBe(true);
    expect(orgNamesMatch('ButcherBox, Inc.', 'ButcherBox')).toBe(true);
    expect(orgNamesMatch('The Malbon Golf Co', 'Malbon Golf')).toBe(true);
  });

  it('rejects genuinely different companies', () => {
    expect(orgNamesMatch('Solace Bands', 'Fore Good Times')).toBe(false);
  });

  it('never matches on empty names', () => {
    expect(orgNamesMatch('', 'Solace Bands')).toBe(false);
  });
});

describe('normalizeDomain', () => {
  it('strips protocol, www/shop/checkout prefixes, and paths', () => {
    expect(normalizeDomain('https://www.solacebands.com/pages/about')).toBe('solacebands.com');
    expect(normalizeDomain('checkout.bodycandy.com')).toBe('bodycandy.com');
    expect(normalizeDomain('shop.malbon.com')).toBe('malbon.com');
    expect(normalizeDomain(null)).toBe('');
  });
});

describe('domainsMatch', () => {
  it('matches exact and subdomain relationships only', () => {
    expect(domainsMatch('solacebands.com', 'solacebands.com')).toBe(true);
    expect(domainsMatch('eu.solacebands.com', 'solacebands.com')).toBe(true);
    expect(domainsMatch('solacebands.com', 'foregoodtimes.com')).toBe(false);
    expect(domainsMatch('', 'solacebands.com')).toBe(false);
  });
});

function person(overrides: Partial<ApolloPerson>): ApolloPerson {
  return {
    name: 'Chad Held',
    first_name: 'Chad',
    last_name: 'Held',
    title: 'Founder',
    email: 'chad@solacebands.com',
    email_status: 'verified',
    linkedin_url: '',
    org_name: 'Solace Bands',
    org_domain: 'solacebands.com',
    employment: [],
    ...overrides,
  };
}

describe('currentRoleAtAccount', () => {
  // The Chad Held regression: he founded a SECOND company while still running
  // Solace Bands. Apollo's primary org pointed at the new venture, which the
  // old logic misread as "left Solace Bands".
  it('finds the role at the account even when a concurrent role elsewhere is primary', () => {
    const p = person({
      title: 'Founder',
      org_name: 'Fore Good Times',
      org_domain: 'foregoodtimes.com',
      employment: [
        { org_name: 'Fore Good Times', title: 'Founder', current: true },
        { org_name: 'Solace Bands', title: 'Co-Founder', current: true },
      ],
    });
    const role = currentRoleAtAccount(p, 'solacebands.com', 'Solace Bands');
    expect(role).not.toBeNull();
    expect(role?.org_name).toBe('Solace Bands');
  });

  it('returns null when the person truly left the account', () => {
    const p = person({
      org_name: 'Acme Corp',
      org_domain: 'acme.com',
      employment: [
        { org_name: 'Acme Corp', title: 'CMO', current: true },
        { org_name: 'Solace Bands', title: 'VP Marketing', current: false },
      ],
    });
    expect(currentRoleAtAccount(p, 'solacebands.com', 'Solace Bands')).toBeNull();
  });

  it('falls back to the primary org when history is empty but domains match', () => {
    const p = person({ employment: [] });
    const role = currentRoleAtAccount(p, 'solacebands.com', 'Solace Bands');
    expect(role?.org_name).toBe('Solace Bands');
  });
});

describe('apolloPaceMs', () => {
  it('returns the default with no header data seen', () => {
    expect(apolloPaceMs(1500)).toBe(1500);
  });
});
