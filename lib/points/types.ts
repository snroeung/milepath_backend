export type RouteType = 'domestic' | 'short_haul' | 'long_haul';
export type Cabin = 'economy' | 'business' | 'first';

export interface FlightContext {
  airlineIata?: string | null;
  originIata?: string | null;
  destIata?: string | null;
  routeType?: RouteType;
  cabin?: Cabin;
}

export type CardId =
  | 'chase_reserve'
  | 'chase_preferred'
  | 'chase_freedom_unlimited'
  | 'c1_venture_x'
  | 'c1_venture'
  | 'c1_savor'
  | 'amex_platinum'
  | 'amex_gold'
  | 'amex_green'
  | 'bilt_blue'
  | 'bilt_obsidian'
  | 'bilt_palladium'
  | 'citi_strata_premier'
  | 'citi_strata_elite';

export type PortalId =
  | 'chase'
  | 'amex'
  | 'c1'
  | 'bilt'
  | 'citi';

export type BookingType = 'hotel' | 'flight';

export interface PortalResult {
  portalId: PortalId;
  portalName: string;
  cardId: CardId;
  cardName: string;
  /** Price this result is calculated against (portal-specific; currently all Duffel) */
  priceUsd: number;
  /** Points needed to book using points through this card's portal */
  pointsNeeded: number;
  centsPerPoint: number;
  /** Points earned if paying cash through this card's portal */
  earnRate: number;
  pointsEarned: number;
  estimated: true;
  bookingType: BookingType;
}

/**
 * All cards for one issuer portal, grouped under the portal's price.
 * Cards are deduplicated by CPP — only one row per distinct CPP tier.
 * When EPS Rapid / Booking.com APIs are added, priceUsd will differ per portal.
 */
export interface PortalGroup {
  portalId: PortalId;
  portalName: string;
  /** Price sourced from this portal's API (currently all Duffel → same value) */
  priceUsd: number;
  /** Unique-CPP card results, sorted best (highest CPP) first */
  results: PortalResult[];
}

export interface EligibleTransferCard {
  cardId: CardId;
  cardName: string;
  portalId: PortalId;
  /** This card's transfer ratio to the partner (e.g. Amex → Hilton is '1:2') */
  ratio: string;
}

/**
 * One card's resolved rate to a partner. Ratios are written per card, not per
 * issuer — two Chase cards reach World of Hyatt at different rates — so the
 * multiplier is resolved from that card's name against the config string.
 */
export interface TransferSourceCard {
  cardId: CardId;
  cardName: string;
  /** Partner points per source point, for this card */
  multiplier: number;
  /** Short display form of this card's ratio — "1:1", "4:3", "1:1.2" */
  ratioLabel: string;
}

/**
 * Every issuer that reaches a partner, with the cards behind it. Ownership is an
 * issuer property (all of an issuer's cards draw on one points pool), but the
 * rate is a card property, so an owned issuer lists the user's own cards and an
 * unowned one lists what it offers.
 */
export interface TransferSourceIssuer {
  portalId: PortalId;
  /** The user holds at least one card on this issuer */
  owned: boolean;
  /** Owned: the user's cards that reach the partner. Unowned: all of the issuer's. */
  cards: TransferSourceCard[];
  /** Best entry in `cards` — the rate an unowned issuer advertises */
  best: TransferSourceCard;
  /** Raw config string, kept verbatim for the hover detail */
  ratio: string;
}

export interface TransferResult {
  partnerProgram: string;
  partnerType: 'hotel' | 'airline';
  sourceCardId: CardId;
  sourcePortalId: PortalId;
  transferRatio: string;
  estimatedPointsNeeded: number | null;
  estimatedCentsPerPoint: number | null;
  /** Effective CPP when transferring, based on flight price vs award cost */
  transferCpp: number | null;
  /**
   * The partner program's own ¢/pt, before any transfer ratio is applied. Every
   * other figure here is denominated in source points; keeping the unscaled
   * value lets a chip restate the rate for its own card's ratio exactly, rather
   * than dividing one card's scaled number by another's.
   */
  partnerCpp: number | null;
  note: string;
  isBetterThanPortal: boolean;
  estimated: true;
  routeType?: RouteType;
  cabin?: Cabin;
  /**
   * Every issuer whose partner list reaches this program, owned ones first.
   * Replaces the old eligible/recommended split, which carried a single
   * ownership flag for the whole row and so could not describe a wallet holding
   * some but not all of the issuers behind a merged partner.
   */
  sourceIssuers: TransferSourceIssuer[];
}

export interface PointsResult {
  /** Baseline price (used for transfer comparisons; equals priceUsd when all portals share one API) */
  priceUsd: number;
  bookingType: BookingType;
  /** Portals grouped by issuer, each with their own price and deduplicated CPP rows */
  portalGroups: PortalGroup[];
  /** Flat best-per-portal list (for transfer comparison logic) */
  portalResults: PortalResult[];
  bestPortalResult: PortalResult;
  transferAlternatives: TransferResult[];
  bestTransferResult: TransferResult | null;
}

export interface PortalCppEntry {
  cpp: number | { hotel: number; flight: number };
  /** Issuer or, where the issuer's own terms page isn't independently fetchable, the best-available cross-checked source (e.g. TPG's program guide). */
  sourceUrl: string;
  /** ISO date this rate was last cross-checked against sourceUrl. */
  lastVerified: string;
}

/**
 * Cents per point when redeeming through each card's travel portal.
 * Higher = more value per point = fewer points needed.
 *
 * chase_reserve/chase_preferred hold the current Points Boost baseline
 * (1.0¢/pt flat); the old fixed legacy rates are no longer modeled.
 */
export const PORTAL_CPP: Record<CardId, PortalCppEntry> = {
  chase_reserve: {
    cpp: 1.0, // Points Boost baseline; actual per-booking boost (up to 2.0) not modeled
    sourceUrl: 'https://www.chase.com/travel/guide/trips/chase-sapphire-points-boost-benefits-guide',
    lastVerified: '2026-08-23',
  },
  chase_preferred: {
    cpp: 1.0, // Points Boost baseline; actual per-booking boost (up to 1.75 flight/1.5 hotel) not modeled
    sourceUrl: 'https://www.chase.com/travel/guide/trips/chase-sapphire-points-boost-benefits-guide',
    lastVerified: '2026-08-23',
  },
  chase_freedom_unlimited: {
    cpp: 1.0, // no portal bonus — Chase's own page states a flat 1¢/pt for travel bookings
    sourceUrl: 'https://www.chase.com/personal/credit-cards/education/chase-cards/use-chase-freedom-unlimited-rewards-for-travel',
    lastVerified: '2026-08-23',
  },
  c1_venture_x: {
    cpp: 1.0, // 1¢/mile fixed via Capital One's "Cover Travel Purchases" (formerly Purchase Eraser)
    sourceUrl: 'https://www.capitalone.com/learn-grow/money-management/redeem-rewards-for-expenses/',
    lastVerified: '2026-08-13',
  },
  c1_venture: {
    cpp: 1.0,
    sourceUrl: 'https://www.capitalone.com/learn-grow/money-management/redeem-rewards-for-expenses/',
    lastVerified: '2026-08-13',
  },
  c1_savor: {
    cpp: 1.0,
    sourceUrl: 'https://www.capitalone.com/learn-grow/money-management/redeem-rewards-for-expenses/',
    lastVerified: '2026-08-13',
  },
  amex_platinum: {
    cpp: { hotel: 0.7, flight: 1.0 }, // 1¢/pt flights; 0.7¢/pt hotels (except Fine Hotels & Resorts at 1¢, not modeled)
    sourceUrl: 'https://www.americanexpress.com/en-us/credit-cards/credit-intel/american-express-points-value/',
    lastVerified: '2026-08-13',
  },
  amex_gold: {
    cpp: { hotel: 0.7, flight: 1.0 },
    sourceUrl: 'https://www.americanexpress.com/en-us/credit-cards/credit-intel/american-express-points-value/',
    lastVerified: '2026-08-13',
  },
  amex_green: {
    cpp: { hotel: 0.7, flight: 1.0 },
    sourceUrl: 'https://www.americanexpress.com/en-us/credit-cards/credit-intel/american-express-points-value/',
    lastVerified: '2026-08-13',
  },
  bilt_blue: {
    // Verified 2026-08-13: Bilt Travel portal redeems at a flat 1.25¢/pt across
    // flights/hotels/rental cars, uniform across Blue/Obsidian/Palladium. Prior
    // value here (1.00) was stale/unsourced — "Bilt Cash" is a separate,
    // independently-earned currency, not what sets this rate.
    cpp: 1.25,
    sourceUrl: 'https://support.biltrewards.com/hc/en-us/articles/6584404460429-What-is-the-value-of-a-Bilt-Point',
    lastVerified: '2026-08-23',
  },
  bilt_obsidian: {
    cpp: 1.25,
    sourceUrl: 'https://support.biltrewards.com/hc/en-us/articles/6584404460429-What-is-the-value-of-a-Bilt-Point',
    lastVerified: '2026-08-23',
  },
  bilt_palladium: {
    cpp: 1.25,
    sourceUrl: 'https://support.biltrewards.com/hc/en-us/articles/6584404460429-What-is-the-value-of-a-Bilt-Point',
    lastVerified: '2026-08-23',
  },
  citi_strata_premier: {
    cpp: 1.0, // Citi Travel portal, flat rate across flights/hotels/car rentals/attractions
    sourceUrl: 'https://www.citi.com/credit-cards/citi-strata-premier-credit-card',
    lastVerified: '2026-08-13',
  },
  citi_strata_elite: {
    cpp: 1.0,
    sourceUrl: 'https://www.citi.com/credit-cards/citi-strata-premier-credit-card',
    lastVerified: '2026-08-13',
  },
};

/**
 * Points earned per dollar spent when paying cash through the card's travel portal.
 * These are the portal-specific bonus earn rates (e.g. Chase Travel 5x flights).
 * Source: published card benefits (as of 2025).
 */
export const CARD_EARN_RATE: Record<CardId, number | { hotel: number; flight: number }> = {
  chase_reserve:           { hotel: 10, flight: 5 },  // 10x hotels, 5x flights via Chase Travel
  chase_preferred:         { hotel: 5,  flight: 3 },  // 5x hotels, 3x flights via Chase Travel
  chase_freedom_unlimited: { hotel: 5,  flight: 3 },  // 5x hotels, 3x flights via Chase Travel
  c1_venture_x:            { hotel: 10, flight: 5 },  // 10x hotels, 5x flights via C1 Travel
  c1_venture:              { hotel: 5,  flight: 5 },  // 5x hotels + flights via C1 Travel
  c1_savor:                1,                          // 1x on travel (dining card)
  amex_platinum:           { hotel: 1,  flight: 5 },  // 5x flights (direct/Amex Travel), 1x hotels
  amex_gold:               { hotel: 2,  flight: 3 },  // 3x flights, ~2x hotels via Amex Travel
  amex_green:              3,                          // 3x travel & transit
  bilt_blue:                    2,                          // 2x travel via Bilt Travel
  bilt_obsidian:                2,                          // 3x travel via Bilt Travel
  bilt_palladium:               2,                          // 3x travel via Bilt Travel
  citi_strata_premier:     3,                          // 3x air/hotel
  citi_strata_elite:       4,                          // 4x air/hotel (premium tier)
};

export const CARD_PORTAL_MAP: Record<CardId, PortalId> = {
  chase_reserve:           'chase',
  chase_preferred:         'chase',
  chase_freedom_unlimited: 'chase',
  c1_venture_x:            'c1',
  c1_venture:              'c1',
  c1_savor:                'c1',
  amex_platinum:           'amex',
  amex_gold:               'amex',
  amex_green:              'amex',
  bilt_blue:                    'bilt',
  bilt_obsidian:                'bilt',
  bilt_palladium:               'bilt',
  citi_strata_premier:     'citi',
  citi_strata_elite:       'citi',
};

// Derived from CARD_PORTAL_MAP so it can't drift from the CardId union —
// single source of truth for "which cards does this issuer offer",
// consumed by the admin offer editor and the scraper's card-id extraction.
export const ISSUER_CARDS: Record<PortalId, CardId[]> = (
  Object.keys(CARD_PORTAL_MAP) as CardId[]
).reduce((acc, cardId) => {
  const portal = CARD_PORTAL_MAP[cardId];
  (acc[portal] ??= []).push(cardId);
  return acc;
}, {} as Record<PortalId, CardId[]>);

/**
 * Issuer/brand words that appear in card names and in nearly every ratio
 * qualifier on that issuer's rows. Matching a card against a qualifier has to
 * ignore them — "other Citi ThankYou cards" would otherwise match every Citi
 * card and swallow the tier-specific rate written for one of them.
 */
export const ISSUER_BRAND_WORDS = [
  'chase', 'amex', 'american', 'express', 'capital', 'one', 'bilt', 'citi',
  'thankyou', 'membership', 'rewards', 'card', 'cards',
];

export const CARD_NAMES: Record<CardId, string> = {
  chase_reserve:           'Chase Sapphire Reserve',
  chase_preferred:         'Chase Sapphire Preferred',
  chase_freedom_unlimited: 'Chase Freedom Unlimited',
  c1_venture_x:            'Capital One Venture X',
  c1_venture:              'Capital One Venture',
  c1_savor:                'Capital One Savor',
  amex_platinum:           'Amex Platinum',
  amex_gold:               'Amex Gold',
  amex_green:              'Amex Green',
  bilt_blue:               'Bilt Blue',
  bilt_obsidian:           'Bilt Obsidian',
  bilt_palladium:          'Bilt Palladium',
  citi_strata_premier:     'Citi Strata Premier',
  citi_strata_elite:       'Citi Strata Elite',
};

export const PORTAL_NAMES: Record<PortalId, string> = {
  chase: 'Chase Travel',
  amex:  'American Express Travel',
  c1:    'Capital One Travel',
  bilt:  'Bilt Travel',
  citi:  'Citi Travel',
};

export const PORTAL_ABBR: Record<PortalId, string> = {
  chase: 'UR', amex: 'MR', c1: 'miles', bilt: 'Bilt', citi: 'TY',
};
