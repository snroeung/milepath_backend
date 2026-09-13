import { describe, it, expect } from 'vitest';
import { calcPoints } from '@/lib/points/calcPoints';
import { calcTransferAlternatives, SEED_TRANSFER_PARTNERS, TransferPartnerConfig, PointsValuationConfig } from '@/lib/points/transferPartners';
import { clusterProgramNames, normalizeProgramName, sameProgram } from '@/lib/points/programNames';
import { PortalResult, PortalId, CardId, CARD_PORTAL_MAP, ISSUER_CARDS, PORTAL_CPP } from '@/lib/points/types';
import { PORTAL_FLIGHT_MARKUP, PORTAL_HOTEL_MARKUP } from '@/lib/points/portalMarkup';

// ---------------------------------------------------------------------------
// calcPoints()
// ---------------------------------------------------------------------------

describe('calcPoints()', () => {
  it('1. basic Chase Reserve hotel — portal price = base × 1.06 hotel markup', () => {
    const result = calcPoints(620, 'hotel', ['chase_reserve']);
    expect(result.portalResults).toHaveLength(1);
    expect(result.portalResults[0].pointsNeeded).toBe(Math.ceil((620 * 1.06) / 0.01)); // 65,720
    expect(result.portalResults[0].priceUsd).toBeCloseTo(620 * 1.06);
  });

  it('2. Chase Reserve beats Chase Preferred — deduplication', () => {
    const result = calcPoints(500, 'hotel', ['chase_reserve', 'chase_preferred']);
    expect(result.portalResults).toHaveLength(1);
    expect(result.portalResults[0].cardId).toBe('chase_reserve');
    expect(result.portalResults[0].pointsNeeded).toBe(Math.ceil((500 * 1.06) / 0.01)); // 53,000
  });

  it('3a. Amex hotel uses 0.7¢ and 1.10 hotel markup', () => {
    const result = calcPoints(400, 'hotel', ['amex_platinum']);
    expect(result.portalResults[0].pointsNeeded).toBe(Math.ceil((400 * 1.1) / 0.007)); // 62,858
  });

  it('3b. Amex flight uses 1.0¢ and 1.1032 flight markup', () => {
    const result = calcPoints(400, 'flight', ['amex_platinum']);
    expect(result.portalResults[0].pointsNeeded).toBe(Math.ceil((400 * 1.1032) / 0.01)); // 44,128
  });

  it('4. all five portals, sorted ascending by pointsNeeded', () => {
    const result = calcPoints(
      300,
      'hotel',
      ['chase_reserve', 'amex_platinum', 'c1_venture_x', 'bilt_blue', 'citi_strata_premier']
    );
    expect(result.portalResults).toHaveLength(5);
    expect(result.portalResults[0].portalId).toBe('bilt'); // 1.25¢ / 1.07 markup = fewest points
    for (let i = 1; i < result.portalResults.length; i++) {
      expect(result.portalResults[i].pointsNeeded).toBeGreaterThanOrEqual(
        result.portalResults[i - 1].pointsNeeded
      );
    }
  });

  it('5. Citi both tiers — dedup keeps one portal result', () => {
    const result = calcPoints(200, 'hotel', ['citi_strata_premier', 'citi_strata_elite']);
    expect(result.portalResults).toHaveLength(1);
    expect(result.portalResults[0].portalId).toBe('citi');
  });

  it('6. Math.ceil enforcement — 100 × 1.06 / 0.01 = 10,600', () => {
    const result = calcPoints(100, 'hotel', ['chase_reserve']);
    expect(result.portalResults[0].pointsNeeded).toBe(10600);
  });

  it('7. guard: priceUsd = 0 throws', () => {
    expect(() => calcPoints(0, 'hotel', ['chase_reserve'])).toThrow('priceUsd must be greater than 0');
  });

  it('8. omitting userCards defaults to all available cards', () => {
    const result = calcPoints(500, 'hotel');
    // All 5 portals should be represented
    const portalIds = result.portalResults.map((r) => r.portalId);
    expect(portalIds).toContain('chase');
    expect(portalIds).toContain('amex');
    expect(portalIds).toContain('c1');
    expect(portalIds).toContain('bilt');
    expect(portalIds).toContain('citi');
  });

  it('9. guard: negative priceUsd throws', () => {
    expect(() => calcPoints(-50, 'hotel', ['chase_reserve'])).toThrow('priceUsd must be greater than 0');
  });

  it('10. estimated flag is always true on every PortalResult', () => {
    const result = calcPoints(500, 'hotel', ['chase_reserve', 'amex_platinum', 'bilt_blue']);
    for (const r of result.portalResults) {
      expect(r.estimated).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// calcPoints() — portal markup
// ---------------------------------------------------------------------------

describe('calcPoints() portal markup', () => {
  it('11. flight markup ranks Capital One over Citi at the same 1.0¢ rate', () => {
    const result = calcPoints(500, 'flight', ['c1_venture_x', 'citi_strata_premier']);
    const c1   = result.portalResults.find((r) => r.portalId === 'c1')!;
    const citi = result.portalResults.find((r) => r.portalId === 'citi')!;
    expect(c1.pointsNeeded).toBe(Math.ceil((500 * PORTAL_FLIGHT_MARKUP.c1) / 0.01)); // 50,380
    expect(citi.pointsNeeded).toBe(Math.ceil((500 * PORTAL_FLIGHT_MARKUP.citi) / 0.01)); // 57,295
    expect(result.portalResults[0].portalId).toBe('c1');
  });

  it('12. centsPerPoint is effective value (rate / markup), rounded to 2dp', () => {
    const hotel = calcPoints(620, 'hotel', ['chase_reserve']);
    expect(hotel.portalResults[0].centsPerPoint).toBe(Math.round((1.0 / PORTAL_HOTEL_MARKUP.chase) * 100) / 100); // 0.94
    const c1 = calcPoints(620, 'hotel', ['c1_venture_x']);
    expect(c1.portalResults[0].centsPerPoint).toBe(0.99); // 1.0 / 1.008
  });

  it('13. portalPrices override is treated as a real portal quote — no re-markup', () => {
    const result = calcPoints(500, 'hotel', ['chase_reserve'], undefined, { chase: 550 });
    expect(result.portalResults[0].priceUsd).toBe(550);
    expect(result.portalResults[0].pointsNeeded).toBe(Math.ceil(550 / 0.01)); // 55,000
    // effective cpp derives from the real quote, not the calibrated constant
    expect(result.portalResults[0].centsPerPoint).toBe(Math.round(1.0 * (500 / 550) * 100) / 100); // 0.91
  });

  it('14. pointsEarned accrues on the marked-up portal price', () => {
    const result = calcPoints(100, 'hotel', ['chase_reserve']); // 10x hotels
    expect(result.portalResults[0].pointsEarned).toBe(Math.floor(100 * 1.06 * 10)); // 1,060
  });
});

// ---------------------------------------------------------------------------
// calcPoints() — Chase current-rate only (legacy fixed rates dropped)
// ---------------------------------------------------------------------------

describe('calcPoints() Chase current-rate only', () => {
  it('15. chase_reserve alone yields a single Points Boost baseline row', () => {
    const result = calcPoints(620, 'hotel', ['chase_reserve']);
    const chaseGroup = result.portalGroups.find((g) => g.portalId === 'chase')!;
    expect(chaseGroup.results).toHaveLength(1);
    expect(chaseGroup.results[0].pointsNeeded).toBe(Math.ceil((620 * 1.06) / 0.01));
  });

  it('16. chase_reserve + chase_preferred share the same cpp tier, deduped to one row', () => {
    const result = calcPoints(500, 'hotel', ['chase_reserve', 'chase_preferred']);
    const chaseGroup = result.portalGroups.find((g) => g.portalId === 'chase')!;
    expect(chaseGroup.results).toHaveLength(1);

    // tie between reserve (10x hotel) and preferred (5x hotel) goes to reserve's higher earn rate
    expect(chaseGroup.results[0].cardId).toBe('chase_reserve');
  });

  it('17. cards outside Chase are unaffected', () => {
    const result = calcPoints(400, 'hotel', ['amex_platinum']);
    expect(result.portalGroups.find((g) => g.portalId === 'amex')!.results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// calcTransferAlternatives()
// ---------------------------------------------------------------------------

const mockBestPortalResult: PortalResult = {
  portalId: 'chase',
  portalName: 'Chase Travel',
  cardId: 'chase_reserve',
  cardName: 'Chase Sapphire Reserve',
  priceUsd: 620,
  pointsNeeded: 41_334,
  centsPerPoint: 1.5,
  earnRate: 3,
  pointsEarned: 124_002,
  estimated: true,
  bookingType: 'hotel',
};

describe('calcTransferAlternatives()', () => {
  it('1. Chase card + Hyatt hotel → Hyatt transfer computes real cpp/points estimate', () => {
    const results = calcTransferAlternatives(620, 'hotel', ['chase_reserve'], mockBestPortalResult, 'Hyatt', undefined, undefined, undefined, SEED_TRANSFER_PARTNERS);
    const hyatt = results.find((r) => r.partnerProgram === 'World of Hyatt');
    expect(hyatt).toBeDefined();
    expect(hyatt?.transferCpp).toBe(1.7);
    expect(hyatt?.estimatedPointsNeeded).toBe(Math.ceil((620 / 1.7) * 100));
    expect(hyatt?.partnerType).toBe('hotel');
  });

  it('2. Chase card + no chain → returns all Chase hotel partners', () => {
    const results = calcTransferAlternatives(620, 'hotel', ['chase_reserve'], mockBestPortalResult, null, undefined, undefined, undefined, SEED_TRANSFER_PARTNERS);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.partnerType === 'hotel')).toBe(true);
  });

  it('3. Amex card + Hilton hotel → transferRatio = "1:2"', () => {
    const amexBest: PortalResult = { ...mockBestPortalResult, portalId: 'amex', cardId: 'amex_platinum', cardName: 'Amex Platinum' };
    const results = calcTransferAlternatives(620, 'hotel', ['amex_platinum'], amexBest, 'Hilton', undefined, undefined, undefined, SEED_TRANSFER_PARTNERS);
    const hilton = results.find((r) => r.partnerProgram === 'Hilton Honors');
    expect(hilton).toBeDefined();
    expect(hilton?.transferRatio).toBe('1:2');
  });

  it('4. flight bookingType → only airline partners returned', () => {
    const flightBest: PortalResult = { ...mockBestPortalResult, bookingType: 'flight' };
    const results = calcTransferAlternatives(400, 'flight', ['chase_reserve'], flightBest, undefined, undefined, undefined, undefined, SEED_TRANSFER_PARTNERS);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.partnerType === 'airline')).toBe(true);
  });

  it('5. invalid card → returns []', () => {
    // @ts-expect-error intentionally passing invalid card
    const results = calcTransferAlternatives(400, 'hotel', ['citi_savor'], mockBestPortalResult);
    expect(results).toEqual([]);
  });

  it('6. isBetterThanPortal = true when hotel transfer cpp beats portal cpp', () => {
    const results = calcTransferAlternatives(620, 'hotel', ['chase_reserve'], mockBestPortalResult, 'Hyatt', undefined, undefined, undefined, SEED_TRANSFER_PARTNERS);
    const hyatt = results.find((r) => r.partnerProgram === 'World of Hyatt');
    expect(hyatt?.estimatedPointsNeeded).toBeLessThan(mockBestPortalResult.pointsNeeded);
    expect(hyatt?.isBetterThanPortal).toBe(true);
  });

  it('6b. calcPoints() with hotelChain filters transferAlternatives to only that chain', () => {
    const result = calcPoints(620, 'hotel', ['chase_reserve'], undefined, undefined, 'Hyatt Regency Chicago', SEED_TRANSFER_PARTNERS);
    expect(result.transferAlternatives.length).toBeGreaterThan(0);
    for (const t of result.transferAlternatives) {
      expect(t.partnerProgram).toBe('World of Hyatt');
    }
  });

  it('6a2. calcPoints() with hotelChain matching no known chain returns zero transfer alternatives', () => {
    const result = calcPoints(620, 'hotel', ['chase_reserve'], undefined, undefined, 'The Local Inn Philadelphia', SEED_TRANSFER_PARTNERS);
    expect(result.transferAlternatives).toHaveLength(0);
  });

  it('6c. calcPoints() without hotelChain returns transfer partners across all chains', () => {
    const result = calcPoints(620, 'hotel', ['chase_reserve'], undefined, undefined, undefined, SEED_TRANSFER_PARTNERS);
    const programs = new Set(result.transferAlternatives.map((t) => t.partnerProgram));
    expect(programs.size).toBeGreaterThan(1);
  });

  it('7. isBetterThanPortal = true when transfer estimate < bestPortalResult.pointsNeeded', () => {
    // Portal costs 41,334 pts; UA economy value (1.3¢/pt) on a $400 fare needs fewer points
    const flightBest: PortalResult = { ...mockBestPortalResult, bookingType: 'flight', pointsNeeded: 41_334 };
    const results = calcTransferAlternatives(400, 'flight', ['chase_reserve'], flightBest, null, 'UA', undefined, undefined, SEED_TRANSFER_PARTNERS);
    const united = results.find((r) => r.partnerProgram === 'United MileagePlus');
    expect(united?.isBetterThanPortal).toBe(true);
    expect(united?.transferCpp).toBe(1.3);
    expect(united?.estimatedPointsNeeded).toBe(30_770);
  });

  it('8. estimatedPointsNeeded scales with price (regression: transfer rows must not share one fixed value)', () => {
    const flightBest: PortalResult = { ...mockBestPortalResult, bookingType: 'flight', pointsNeeded: 41_334 };
    const cheap = calcTransferAlternatives(200, 'flight', ['chase_reserve'], flightBest, null, 'UA', undefined, undefined, SEED_TRANSFER_PARTNERS);
    const expensive = calcTransferAlternatives(800, 'flight', ['chase_reserve'], flightBest, null, 'UA', undefined, undefined, SEED_TRANSFER_PARTNERS);
    const cheapUnited = cheap.find((r) => r.partnerProgram === 'United MileagePlus');
    const expensiveUnited = expensive.find((r) => r.partnerProgram === 'United MileagePlus');
    expect(cheapUnited?.estimatedPointsNeeded).not.toBe(expensiveUnited?.estimatedPointsNeeded);
    expect(expensiveUnited!.estimatedPointsNeeded!).toBeGreaterThan(cheapUnited!.estimatedPointsNeeded!);
  });

  it('9. different airline programs at the same price get different points (no coincidental clustering)', () => {
    const flightBest: PortalResult = { ...mockBestPortalResult, bookingType: 'flight', pointsNeeded: 41_334 };
    const results = calcTransferAlternatives(400, 'flight', ['chase_reserve', 'amex_platinum'], flightBest, undefined, undefined, undefined, undefined, SEED_TRANSFER_PARTNERS);
    const united = results.find((r) => r.partnerProgram === 'United MileagePlus');
    const delta = results.find((r) => r.partnerProgram === 'Delta SkyMiles');
    expect(united?.estimatedPointsNeeded).not.toBeNull();
    expect(delta?.estimatedPointsNeeded).not.toBeNull();
    expect(united?.estimatedPointsNeeded).not.toBe(delta?.estimatedPointsNeeded);
  });
});

// Regression tests for the "duplicate transfer row" bug: DB-approved rows for
// the same real-world loyalty program are sometimes named differently across
// portals (source page wording varies). calcTransferAlternatives must merge
// them into a single row when given a DB-backed partnersMap, not just the
// bundled STATIC_TRANSFER_PARTNERS set.
describe('calcTransferAlternatives() cross-portal dedup (DB-backed partner map)', () => {
  const flightBest: PortalResult = { ...mockBestPortalResult, bookingType: 'flight', pointsNeeded: 41_334 };

  it('merges "TAP Air Portugal Miles&Go" (Capital One) and "TAP Miles&Go" (Bilt) into one row', () => {
    const partnersMap: Record<PortalId, TransferPartnerConfig[]> = {
      ...SEED_TRANSFER_PARTNERS,
      bilt: [
        ...SEED_TRANSFER_PARTNERS.bilt,
        { program: 'TAP Miles&Go', type: 'airline', ratio: '1:1', iataCodes: ['TP'] },
      ],
    };
    const results = calcTransferAlternatives(
      400, 'flight', ['c1_venture_x', 'bilt_blue'], flightBest, null, 'TP', undefined, undefined, partnersMap,
    );
    const tapRows = results.filter((r) => sameProgram(r.partnerProgram, 'TAP Air Portugal Miles&Go'));
    expect(tapRows).toHaveLength(1);
    expect(tapRows[0].sourceIssuers.filter((i) => i.owned).map((i) => i.portalId).sort()).toEqual(['bilt', 'c1']);
  });

  it('merges "American AAdvantage" (Bilt) and "AAdvantage Program" (Citi) into one row', () => {
    const partnersMap: Record<PortalId, TransferPartnerConfig[]> = {
      ...SEED_TRANSFER_PARTNERS,
      citi: [
        ...SEED_TRANSFER_PARTNERS.citi,
        { program: 'AAdvantage Program', type: 'airline', ratio: '1:1', iataCodes: ['AA'] },
      ],
    };
    const results = calcTransferAlternatives(
      400, 'flight', ['bilt_blue', 'citi_strata_premier'], flightBest, null, 'AA', undefined, undefined, partnersMap,
    );
    const aaRows = results.filter((r) => sameProgram(r.partnerProgram, 'American AAdvantage'));
    expect(aaRows).toHaveLength(1);
    expect(aaRows[0].sourceIssuers.filter((i) => i.owned).map((i) => i.portalId).sort()).toEqual(['bilt', 'citi']);
  });
});

// A merged row must name a route the user can actually take. It used to name
// whichever issuer redeemed highest, so a wallet holding some but not all of a
// program's issuers was told to transfer from one it didn't have. These
// invariants are asserted across the whole partner map rather than for named
// programs, so they hold for every partner the table grows.
describe('calcTransferAlternatives() route selection follows the wallet', () => {
  const ALL_ISSUERS: PortalId[] = ['chase', 'amex', 'c1', 'bilt', 'citi'];

  /** Which issuers reach this program at all, straight from the config map. */
  function issuersReaching(program: string, type: 'hotel' | 'airline'): PortalId[] {
    return ALL_ISSUERS.filter((portalId) =>
      SEED_TRANSFER_PARTNERS[portalId].some(
        (p) => p.type === type && sameProgram(p.program, program),
      ),
    );
  }

  function rowsFor(cards: CardId[], bookingType: 'hotel' | 'flight') {
    return bookingType === 'flight'
      ? calcPoints(400, 'flight', cards, { cabin: 'economy' }, undefined, null, SEED_TRANSFER_PARTNERS).transferAlternatives
      : calcPoints(620, 'hotel', cards, undefined, undefined, null, SEED_TRANSFER_PARTNERS).transferAlternatives;
  }

  const WALLETS: Array<[string, CardId[]]> = [
    ['one issuer', ['c1_venture_x']],
    ['two issuers', ['c1_venture_x', 'chase_reserve']],
    ['two cards, one issuer', ['chase_reserve', 'chase_preferred']],
    ['every issuer', ['chase_reserve', 'amex_platinum', 'c1_venture_x', 'bilt_blue', 'citi_strata_premier']],
  ];

  for (const bookingType of ['hotel', 'flight'] as const) {
    const partnerType = bookingType === 'flight' ? 'airline' : 'hotel';

    describe(`${bookingType} rows`, () => {
      it.each(WALLETS)('lists every issuer that reaches the program — %s', (_label, cards) => {
        for (const row of rowsFor(cards, bookingType)) {
          const expected = issuersReaching(row.partnerProgram, partnerType).sort();
          expect(row.sourceIssuers.map((i) => i.portalId).sort()).toEqual(expected);
        }
      });

      it.each(WALLETS)('sources the row from an issuer the wallet holds — %s', (_label, cards) => {
        const ownedPortals = new Set(cards.map((c) => CARD_PORTAL_MAP[c]));
        for (const row of rowsFor(cards, bookingType)) {
          const owned = row.sourceIssuers.filter((i) => i.owned);
          expect(owned.map((i) => i.portalId).sort()).toEqual(
            row.sourceIssuers.map((i) => i.portalId).filter((p) => ownedPortals.has(p)).sort(),
          );
          if (owned.length > 0) {
            expect(owned.map((i) => i.portalId)).toContain(row.sourcePortalId);
            expect(CARD_PORTAL_MAP[row.sourceCardId]).toBe(row.sourcePortalId);
            // Never advertises a card the user doesn't hold as the route.
            expect(cards).toContain(row.sourceCardId);
          }
        }
      });

      it.each(WALLETS)('lists owned cards for owned issuers, the full lineup otherwise — %s', (_label, cards) => {
        for (const row of rowsFor(cards, bookingType)) {
          for (const issuer of row.sourceIssuers) {
            const ids = issuer.cards.map((c) => c.cardId);
            expect(ids.length).toBeGreaterThan(0);
            if (issuer.owned) {
              expect(ids.every((id) => cards.includes(id))).toBe(true);
            } else {
              expect(ids).toEqual(ISSUER_CARDS[issuer.portalId]);
            }
            // `best` is the top-rated entry of whatever the issuer lists.
            expect(issuer.best.multiplier).toBe(Math.max(...issuer.cards.map((c) => c.multiplier)));
          }
        }
      });
    });
  }

  it('prefers the better-ratio issuer among owned cards', () => {
    const partnersMap: Record<PortalId, TransferPartnerConfig[]> = {
      ...SEED_TRANSFER_PARTNERS,
      c1: [
        ...SEED_TRANSFER_PARTNERS.c1,
        { program: 'Hilton Honors', type: 'hotel', ratio: '1:1', chainKey: 'hilton' },
      ],
    };
    const results = calcTransferAlternatives(
      620, 'hotel', ['amex_platinum', 'c1_venture_x'], mockBestPortalResult, 'Hilton',
      undefined, undefined, ['amex_platinum', 'c1_venture_x'], partnersMap,
    );
    const hilton = results.find((r) => r.partnerProgram === 'Hilton Honors')!;
    expect(hilton.sourcePortalId).toBe('amex');
    expect(hilton.sourceCardId).toBe('amex_platinum');
  });

  it('states a 1:2 transfer in source points — twice the partner rate, half the points', () => {
    const amexBest: PortalResult = { ...mockBestPortalResult, portalId: 'amex', cardId: 'amex_platinum', cardName: 'Amex Platinum' };
    const results = calcTransferAlternatives(
      620, 'hotel', ['amex_platinum'], amexBest, 'Hilton', undefined, undefined, undefined, SEED_TRANSFER_PARTNERS,
    );
    const hilton = results.find((r) => r.partnerProgram === 'Hilton Honors')!;
    // Hilton points are worth 0.5¢ each, so one Amex point buying two of them is 1.0¢.
    expect(hilton.partnerCpp).toBe(0.5);
    expect(hilton.transferCpp).toBe(1.0);
    expect(hilton.estimatedPointsNeeded).toBe(Math.ceil((620 / 1.0) * 100));
  });

  it('prices a per-card ratio against the card that gets it', () => {
    // Same Chase config, two cards, two rates: Reserve keeps 1:1, Preferred
    // moves to 4:3 in 2026. The row must price whichever card the user holds.
    const partnersMap: Record<PortalId, TransferPartnerConfig[]> = {
      ...SEED_TRANSFER_PARTNERS,
      chase: [
        { program: 'World of Hyatt', type: 'hotel', chainKey: 'hyatt',
          ratio: '1:1 (standard, Sapphire Reserve); 4:3 (Chase Sapphire Preferred and Ink Business Preferred, effective 2026)' },
      ],
    };
    const rowFor = (cards: CardId[]) => calcTransferAlternatives(
      620, 'hotel', cards, mockBestPortalResult, 'Hyatt', undefined, undefined, cards, partnersMap,
    ).find((r) => r.partnerProgram === 'World of Hyatt')!;

    // Hyatt points are 1.7¢; Reserve transfers 1:1, Preferred gives up a quarter.
    expect(rowFor(['chase_reserve']).transferCpp).toBe(1.7);
    expect(rowFor(['chase_preferred']).transferCpp).toBe(Math.round(1.7 * (3 / 4) * 100) / 100);
  });
});

// Provenance is required per-entry (not optional) so a stale rate — like the
// Bilt entries below, previously 1.00 with no source — gets caught instead of
// silently persisting.
describe('PORTAL_CPP provenance', () => {
  it('every entry has a sourceUrl and an ISO lastVerified date', () => {
    for (const [cardId, entry] of Object.entries(PORTAL_CPP)) {
      expect(entry.sourceUrl, `${cardId} sourceUrl`).toMatch(/^https:\/\//);
      expect(entry.lastVerified, `${cardId} lastVerified`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('bilt cards redeem at the verified 1.25¢/pt Bilt Travel rate, not the stale 1.00 placeholder', () => {
    expect(PORTAL_CPP.bilt_blue.cpp).toBe(1.25);
    expect(PORTAL_CPP.bilt_obsidian.cpp).toBe(1.25);
    expect(PORTAL_CPP.bilt_palladium.cpp).toBe(1.25);
  });
});

// Two-step, currency-explicit points calc: partner points needed (in the
// PARTNER's own currency) are computed first, then converted to the SOURCE
// card's currency via the transfer ratio — two currencies, two named steps,
// no intermediate blended rate. Pins the worked example from the approved
// transfer-recommendation-engine plan so a future refactor can't silently
// drift back to a single-step calc.
describe('calcTransferAlternatives() two-step points calc (currency-explicit)', () => {
  // portalPointsNeeded = ceil(318 / 0.0100) = 31,800, matching the plan's
  // worked example ($300 x 1.06 chase hotel markup = $318 portalPrice, at
  // chase_reserve's 1.0¢ PORTAL_CPP baseline).
  const portalResult300: PortalResult = {
    ...mockBestPortalResult,
    priceUsd: 318,
    pointsNeeded: 31_800,
  };

  it('ratio 1:1 — partner points needed equals source-card points needed', () => {
    const results = calcTransferAlternatives(
      300, 'hotel', ['chase_reserve'], portalResult300, 'Hyatt', undefined, undefined, undefined, SEED_TRANSFER_PARTNERS,
    );
    const hyatt = results.find((r) => r.partnerProgram === 'World of Hyatt');
    // Step 1 (Hyatt's own currency): ceil(300 / (1.7/100)) = ceil(17,647.06) = 17,648 Hyatt points
    // Step 2 (convert to Chase UR via 1:1): ceil(17,648 / 1) = 17,648 Chase UR points
    expect(hyatt?.partnerCpp).toBe(1.7);
    expect(hyatt?.estimatedPointsNeeded).toBe(17_648);
    expect(hyatt?.isBetterThanPortal).toBe(true);
  });

  it('unfavorable ratio (1,000:800) — conversion step raises source-card points needed', () => {
    const partnersMap: Record<PortalId, TransferPartnerConfig[]> = {
      ...SEED_TRANSFER_PARTNERS,
      chase: [
        { program: 'World of Hyatt', type: 'hotel', chainKey: 'hyatt', ratio: '1,000:800' },
      ],
    };
    const results = calcTransferAlternatives(
      300, 'hotel', ['chase_reserve'], portalResult300, 'Hyatt', undefined, undefined, undefined, partnersMap,
    );
    const hyatt = results.find((r) => r.partnerProgram === 'World of Hyatt');
    // Step 1 is unchanged (still Hyatt's own currency): 17,648 Hyatt points.
    // Step 2 (convert via 1,000:800 → 0.8 Hyatt pts per Chase pt): ceil(17,648 / 0.8) = 22,060
    expect(hyatt?.estimatedPointsNeeded).toBe(22_060);
    // Still fewer than the 31,800-point portal baseline, but a narrower margin
    // than the 1:1 case above — the conversion step is what produces that gap.
    expect(hyatt?.isBetterThanPortal).toBe(true);
  });
});

// Admin-approved TPG monthly valuations (trpc.portalData.listPointsValuations)
// override the hardcoded PARTNER_CPP table when a program matches — for every
// cabin, since neither side of this system has cabin-specific data (PARTNER_CPP
// is one flat figure per program, and points_valuations has no cabin column).
describe('calcTransferAlternatives() DB-sourced points_valuations override', () => {
  it('overrides the hardcoded hotel rate when the program matches exactly', () => {
    const pointsValuations: PointsValuationConfig[] = [{ program: 'World of Hyatt', cpp: 2.0 }];
    const results = calcTransferAlternatives(
      300, 'hotel', ['chase_reserve'], mockBestPortalResult, 'Hyatt', undefined, undefined, undefined, SEED_TRANSFER_PARTNERS, pointsValuations,
    );
    const hyatt = results.find((r) => r.partnerProgram === 'World of Hyatt');
    // Hardcoded PARTNER_CPP.hyatt is 1.7 — the DB value (2.0) should win.
    expect(hyatt?.partnerCpp).toBe(2.0);
  });

  it('overrides via sameProgram() aliasing, not just an exact string match', () => {
    const pointsValuations: PointsValuationConfig[] = [{ program: 'Hyatt', cpp: 2.2 }];
    const results = calcTransferAlternatives(
      300, 'hotel', ['chase_reserve'], mockBestPortalResult, 'Hyatt', undefined, undefined, undefined, SEED_TRANSFER_PARTNERS, pointsValuations,
    );
    const hyatt = results.find((r) => r.partnerProgram === 'World of Hyatt');
    expect(hyatt?.partnerCpp).toBe(2.2);
  });

  it('falls back to the hardcoded rate when no DB valuation matches the program', () => {
    const pointsValuations: PointsValuationConfig[] = [{ program: 'Marriott Bonvoy', cpp: 5.0 }];
    const results = calcTransferAlternatives(
      300, 'hotel', ['chase_reserve'], mockBestPortalResult, 'Hyatt', undefined, undefined, undefined, SEED_TRANSFER_PARTNERS, pointsValuations,
    );
    const hyatt = results.find((r) => r.partnerProgram === 'World of Hyatt');
    expect(hyatt?.partnerCpp).toBe(1.7);
  });

  it('overrides the economy rate for a flight partner when the program matches', () => {
    const pointsValuations: PointsValuationConfig[] = [{ program: 'United MileagePlus', cpp: 3.0 }];
    const flightBest: PortalResult = { ...mockBestPortalResult, bookingType: 'flight' };
    const results = calcTransferAlternatives(
      500, 'flight', ['chase_reserve'], flightBest, undefined, 'UA', { cabin: 'economy' }, undefined, SEED_TRANSFER_PARTNERS, pointsValuations,
    );
    const united = results.find((r) => r.partnerProgram === 'United MileagePlus');
    // Hardcoded PARTNER_CPP.UA is 1.3 — the DB value (3.0) should win.
    expect(united?.partnerCpp).toBe(3.0);
  });

  it('overrides business/first cabins too — PARTNER_CPP has no cabin split, so there is no cabin-specific hardcoded value to protect', () => {
    const pointsValuations: PointsValuationConfig[] = [{ program: 'United MileagePlus', cpp: 3.0 }];
    const flightBest: PortalResult = { ...mockBestPortalResult, bookingType: 'flight' };
    const results = calcTransferAlternatives(
      500, 'flight', ['chase_reserve'], flightBest, undefined, 'UA', { cabin: 'business' }, undefined, SEED_TRANSFER_PARTNERS, pointsValuations,
    );
    const united = results.find((r) => r.partnerProgram === 'United MileagePlus');
    expect(united?.partnerCpp).toBe(3.0);
  });
});

// Program identity is decided by brand tokens, not by an alias table: issuers
// spell one program a dozen ways, and every unlisted spelling used to become a
// second row for the same transfer.
describe('sameProgram()', () => {
  const SAME: Array<[string, string]> = [
    ['TAP Miles&Go', 'TAP Air Portugal Miles&Go'],
    ['AAdvantage', 'American AAdvantage'],
    ['British Airways Avios', 'British Airways Executive Club'],
    ['British Airways Club', 'British Airways Executive Club'],
    ['Qatar Airways Avios', 'Qatar Airways Privilege Club'],
    ['Qatar Airways Privilege Club (Avios)', 'Qatar Airways Privilege Club'],
    ['Cathay Pacific Cathay', 'Cathay Pacific Asia Miles'],
    ['JAL Mileage Bank', 'JAL (Japan Airlines) Mileage Bank'],
    ['United MileagePlus', 'United Airlines MileagePlus'],
    ['Singapore KrisFlyer', 'Singapore Airlines KrisFlyer'],
    ['Air France-KLM Flying Blue', 'Air France/KLM Flying Blue'],
    ['Flying Blue', 'Air France/KLM Flying Blue'],
    ['Accor Live Limitless', 'ALL - Accor Live Limitless'],
    ['Turkish Airlines Miles&Smiles', 'Turkish Airlines Miles & Smiles'],
  ];

  it.each(SAME)('treats %s and %s as one program', (a, b) => {
    expect(sameProgram(a, b)).toBe(true);
    expect(sameProgram(b, a)).toBe(true);
  });

  const DIFFERENT: Array<[string, string]> = [
    ['United MileagePlus', 'Delta SkyMiles'],
    ['Air Canada Aeroplan', 'Air France/KLM Flying Blue'],
    ['Virgin Atlantic Flying Club', 'Air France/KLM Flying Blue'],
    ['British Airways Avios', 'Qatar Airways Avios'],
    ['World of Hyatt', 'Marriott Bonvoy'],
    ['Iberia Plus', 'Aer Lingus AerClub'],
  ];

  it.each(DIFFERENT)('keeps %s and %s apart', (a, b) => {
    expect(sameProgram(a, b)).toBe(false);
  });
});

describe('clusterProgramNames()', () => {
  it('links two spellings through a third that mentions both', () => {
    const clusters = clusterProgramNames([
      'I Prefer Hotel Rewards',
      'Preferred Hotels & Resorts',
      'I Prefer Hotel Rewards (Preferred Hotels & Resorts)',
    ]);
    expect(new Set(clusters.values()).size).toBe(1);
  });

  it('keeps unrelated programs in their own clusters', () => {
    const clusters = clusterProgramNames(['United MileagePlus', 'Delta SkyMiles', 'World of Hyatt']);
    expect(new Set(clusters.values()).size).toBe(3);
  });

  it('normalizes case and punctuation', () => {
    expect(normalizeProgramName('Air France-KLM Flying Blue')).toBe(normalizeProgramName('Air France/KLM Flying Blue'));
  });
});
