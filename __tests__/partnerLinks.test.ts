import { describe, it, expect } from 'vitest';
import { PORTAL_TRAVEL_URLS, resolvePartnerUrl } from '@/lib/points/partnerLinks';
import { SEED_TRANSFER_PARTNERS } from '@/lib/points/transferPartners';
import type { PortalId } from '@/lib/points/types';

const PORTAL_IDS: PortalId[] = ['chase', 'amex', 'c1', 'bilt', 'citi'];

describe('PORTAL_TRAVEL_URLS', () => {
  it.each(PORTAL_IDS)('has a travel page for %s', (portalId) => {
    expect(PORTAL_TRAVEL_URLS[portalId]).toMatch(/^https:\/\//);
  });
});

describe('resolvePartnerUrl()', () => {
  // Every unique program across the seed transfer partners table — if a new
  // partner is added there without a matching entry here, this fails loudly
  // rather than silently shipping a dead "Visit partner" button.
  const seedPrograms = Array.from(
    new Set(Object.values(SEED_TRANSFER_PARTNERS).flat().map(p => p.program)),
  );

  it.each(seedPrograms)('resolves a URL for %s', (program) => {
    expect(resolvePartnerUrl(program)).toMatch(/^https:\/\//);
  });

  it('matches on program identity, not exact string, via sameProgram', () => {
    // Bilt's seed spells this "TAP Air Portugal Miles&Go" — a differently
    // spelled variant of the same real-world program should still resolve.
    expect(resolvePartnerUrl('TAP Miles&Go')).toBe(resolvePartnerUrl('TAP Air Portugal Miles&Go'));
  });

  it('returns null for a program with no registered link', () => {
    expect(resolvePartnerUrl('Not A Real Loyalty Program')).toBeNull();
  });
});
