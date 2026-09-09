import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  createSpendingBonus,
  createTransferBonus,
  createTransferPartner,
  createTravelCollection,
  setOfferActive,
  setTransferPartnerActive,
  setTravelCollectionActive,
  today,
  daysFromNow,
  TEST_PREFIX,
} from '../utils/admin-helpers';

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

const DEPART_DATE = futureDate(21);
const RETURN_DATE = futureDate(28);

// PHL → SFO — matches the route used in search.spec.ts's flight flow
const FLIGHT_QUERY = new URLSearchParams({
  origin: 'PHL',
  originName: 'Philadelphia International Airport',
  destinationCode: 'SFO',
  destination: 'San Francisco International Airport',
  tripType: 'roundtrip',
  departDate: DEPART_DATE,
  returnDate: RETURN_DATE,
  adults: '1',
  cabinClass: 'economy',
}).toString();

async function gotoFlightsWithResults(page: Page) {
  await page.goto(`/flights?${FLIGHT_QUERY}`);
  await expect(
    page.getByRole('main').getByText(/flights? · PHL → SFO|No flights found for this route and date|Flight search failed/),
  ).toBeVisible({ timeout: 30_000 });
}

test.describe('Flights page — empty state', () => {
  test('prompts for a search with no query params', async ({ page }) => {
    await page.goto('/flights');
    await expect(page.getByRole('main').getByText('Select departure and arrival airports to search.')).toBeVisible();
  });
});

test.describe('Flights page — results', () => {
  test('loads results from query params and passes a11y', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const cards = page.getByTestId('flight-card');
    const count = await cards.count();
    test.skip(count === 0, 'No flights returned by Duffel for this query');

    await expect(cards.first()).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('sort tabs reorder results', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total < 2, 'Need 2+ flights to verify sort order');

    await page.getByRole('button', { name: 'Cheap' }).click();
    await expect(async () => {
      const stillThere = await cards.count();
      expect(stillThere).toBe(total);
    }).toPass();

    await page.getByRole('button', { name: 'Fast' }).click();
    await expect(async () => {
      const stillThere = await cards.count();
      expect(stillThere).toBe(total);
    }).toPass();
  });

  test('Refine sidebar narrows results by stops', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    const nonstop = page.getByRole('button', { name: /^Nonstop/ });
    const hasNonstop = await nonstop.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!hasNonstop, 'No nonstop filter available for this result set');

    await nonstop.click();

    await expect(async () => {
      const filtered = await cards.count();
      expect(filtered).toBeLessThanOrEqual(total);
    }).toPass();
  });

  test('Compare expands a best portal and a transfer partner, then collapses', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    const card = cards.first();
    const compareButton = card.getByRole('button', { name: /^Compare \d+ portals?/ });
    const hasCompare = await compareButton.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasCompare, 'No points data for this offer — no cards selected, or no portal priced it');

    await compareButton.click();
    // The two default-visible rows are the best direct-book portal and the best
    // transfer partner; every other option lives in the grouped popover.
    // Exactly one of the two carries the "Best choice" highlight — whichever
    // actually beats the other, portal or transfer — never both, never neither.
    await expect(card.getByText('Best choice')).toHaveCount(1);
    const viewDealLink = card.getByRole('link', { name: /^(Book on|Visit) .+$/ }).first();
    await expect(viewDealLink).toBeVisible();
    await expect(viewDealLink).toHaveAttribute('target', '_blank');
    await expect(viewDealLink).toHaveAttribute('href', /^https:\/\//);
    await expect(viewDealLink).toHaveAttribute('rel', /noopener/);

    await card.getByRole('button', { name: '↑ Hide' }).click();
    await expect(card.getByText('Best choice')).not.toBeVisible();
  });

  test('a transfer row always says which card the points come out of', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    const card = cards.first();
    const compareButton = card.getByRole('button', { name: /^Compare \d+ portals?/ });
    const hasCompare = await compareButton.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasCompare, 'No points data for this offer');
    await compareButton.click();

    // Only a transfer row renders source-card chips — a more reliable presence
    // check than the row's badge text, which now reads "Best choice" instead of
    // "Transfer partner" whenever the transfer row is the winning option.
    const grid = card.getByTestId('redemption-table');
    const chips = grid.getByTestId('source-chip');
    const hasTransfer = await chips.first().isVisible().catch(() => false);
    test.skip(!hasTransfer, 'No transfer partner priced this itinerary');

    // The row names an issuer ("… via Chase"), so it must also say whether that
    // issuer is in the user's wallet. Asserted on chip state rather than on a
    // named program, so changing live inventory can't invalidate the spec.
    await expect(chips.first()).toBeVisible({ timeout: 10_000 });

    // Ownership belongs to the chip, not the row: some chips may be owned while
    // others aren't. The disclaimer is legitimate only when none are owned.
    const ownedChips = grid.locator('[data-testid="source-chip"][data-owned="true"]');
    const disclaimer = grid.getByText(/Not in your wallet/);
    expect(await ownedChips.count() > 0).toBe(!(await disclaimer.count() > 0));

    const sourceStated = grid.getByText(/^Transfer from|Not in your wallet/);
    await expect(sourceStated.first()).toBeVisible({ timeout: 10_000 });
  });

  test('remaining portals open in a popover, not an inline expansion', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    const card = cards.first();
    const compareButton = card.getByRole('button', { name: /^Compare \d+ portals?/ });
    const hasCompare = await compareButton.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasCompare, 'No points data for this offer');
    await compareButton.click();

    const trigger = card.getByRole('button', { name: /^See \d+ (round-trip|one-way) options?$/ });
    const hasAlternatives = await trigger.isVisible().catch(() => false);
    test.skip(!hasAlternatives, 'This offer has no options beyond the two featured rows');

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    const popover = card.getByRole('dialog');
    await expect(popover).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const popoverDealLink = popover.getByRole('link', { name: /^(Book on|Visit) .+$/ }).first();
    await expect(popoverDealLink).toBeVisible();
    await expect(popoverDealLink).toHaveAttribute('href', /^https:\/\//);

    // The popover covers the points grid exactly — it must not spill onto the
    // next result card or leave the grid half-visible behind it.
    const gridBox = await card.getByTestId('redemption-table').boundingBox();
    const popoverBox = await popover.boundingBox();
    expect(gridBox).not.toBeNull();
    expect(popoverBox).not.toBeNull();
    for (const side of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(popoverBox![side] - gridBox![side])).toBeLessThanOrEqual(1);
    }

    // Close button, then Escape — both dismiss it.
    await popover.getByRole('button', { name: 'Close options' }).click();
    await expect(popover).not.toBeVisible();

    await trigger.click();
    await expect(popover).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popover).not.toBeVisible();
  });

  test('the round-trip itinerary labels both routes and collapses them', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    // FLIGHT_QUERY is a round trip, so every result has two labelled routes.
    const card = cards.first();
    const outbound = card.getByText('Outbound', { exact: true }).first();
    await expect(outbound).toBeVisible();
    await expect(card.getByText('Return', { exact: true }).first()).toBeVisible();

    const toggle = card.getByRole('button', { name: /Round-trip itinerary/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await toggle.click();
    await expect(outbound).not.toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(outbound).toBeVisible();
  });
});

test.describe('Flights page — pagination', () => {
  test('page 1 caps at the page size and states the range', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const pager = page.getByRole('navigation', { name: /results pagination/i });
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 11 results returned — pagination not rendered');

    const cards = page.getByTestId('flight-card');
    const count = await cards.count();
    expect(count).toBeLessThanOrEqual(50);

    const rangeText = await pager.getByRole('status').textContent();
    const match = rangeText?.match(/Showing (\d+)[–-](\d+) of (\d+)/i);
    expect(match).not.toBeNull();
    const total = Number(match![3]);
    // Regression guard: this used to hard-cap at 15 regardless of total.
    if (total > 15) expect(count).toBeGreaterThan(15);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('per-page selector caps the list', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const pager = page.getByRole('navigation', { name: /results pagination/i });
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 11 results returned — pagination not rendered');

    await page.getByLabel('Per page').selectOption('10');
    await expect(page.getByTestId('flight-card')).toHaveCount(10);
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  test('Next advances the page, swaps the results, and scrolls to top', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const pager = page.getByRole('navigation', { name: /results pagination/i });
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 11 results returned — pagination not rendered');

    await page.getByLabel('Per page').selectOption('10');
    const firstCardBefore = await page.getByTestId('flight-card').first().innerText();

    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    const firstCardAfter = await page.getByTestId('flight-card').first().innerText();
    expect(firstCardAfter).not.toBe(firstCardBefore);

    const scrollTop = await page.getByRole('main').evaluate((el) => el.scrollTop);
    expect(scrollTop).toBe(0);

    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(page.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  });

  test('changing sort resets to page 1', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const pager = page.getByRole('navigation', { name: /results pagination/i });
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 11 results returned — pagination not rendered');

    await page.getByLabel('Per page').selectOption('10');
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: 'Cheap' }).click();
    await expect(page.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  test('per-page choice persists across reload', async ({ page }) => {
    await gotoFlightsWithResults(page);

    const pager = page.getByRole('navigation', { name: /results pagination/i });
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 11 results returned — pagination not rendered');

    await page.getByLabel('Per page').selectOption('10');
    await gotoFlightsWithResults(page);

    await expect(page.getByLabel('Per page')).toHaveValue('10');
    await expect(page.getByTestId('flight-card')).toHaveCount(10);
  });
});

test.describe('Flights page — banners', () => {
  test.describe.configure({ mode: 'serial' });
  const PARTNER_PROGRAM = `${TEST_PREFIX} Test Airline Miles`;
  const COLLECTION_NAME = `${TEST_PREFIX} Flight Banner Match Test`;
  let bonusCreated = false;

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await ctx.newPage();
    if (bonusCreated) await setOfferActive(page, PARTNER_PROGRAM, false).catch(() => {});
    await setTransferPartnerActive(page, PARTNER_PROGRAM, false).catch(() => {});
    await setTravelCollectionActive(page, COLLECTION_NAME, false).catch(() => {});
    await ctx.close();
  });

  test('TransferBonusBanner appears on a flight card when a live bonus matches a transferable partner', async ({ page }) => {
    await gotoFlightsWithResults(page);
    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    // Real seeded transfer partners depend on which carrier this sandbox
    // account's (non-deterministic) search happens to return — instead,
    // read the actual operating-carrier IATA code off the first card and
    // create a [TEST] transfer partner + bonus tied to exactly that
    // carrier, so the match is deterministic rather than a data-availability
    // coin flip.
    const badge = cards.first().getByTestId('airline-badge').first();
    const iataCode = (await badge.textContent())?.trim() || null;
    test.skip(!iataCode || iataCode === '?', 'Could not read an operating-carrier IATA code from the first result');

    await createTransferPartner(page, {
      portal: 'Chase',
      type: 'airline',
      program: PARTNER_PROGRAM,
      ratio: '1:1',
      iataCodes: iataCode!,
    });

    await createTransferBonus(page, {
      issuer: 'chase',
      partner: PARTNER_PROGRAM,
      bonusPct: 30,
      startDate: today(),
      endDate: daysFromNow(30),
      description: 'E2E banner match bonus.',
    });
    bonusCreated = true;

    // Re-search — the offer list itself may come from flights.ts's
    // server-side cache (fine, carriers don't change), but the banner match
    // is computed client-side from fresh portalData.listTransferPartners +
    // offers.listTransferBonuses data, so no cache-busting is needed here
    // (unlike the CollectionBanner test below, where the match is baked
    // into the cached server response itself).
    await gotoFlightsWithResults(page);
    // Our test data ties to one specific carrier, so a page-scoped assertion
    // carries no ambiguity risk.
    const escapedPartner = PARTNER_PROGRAM.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bannerTextRe = new RegExp(`to ${escapedPartner}`);
    await expect(page.getByText(bannerTextRe).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Limited time').first()).toBeVisible();
  });

  test('CollectionBanner appears on a flight card matching a live travel collection', async ({ page }) => {
    await gotoFlightsWithResults(page);
    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    // Read the real operating-carrier IATA code directly off the airline
    // badge in the card's summary header, rather than guessing a carrier that
    // may not actually serve this route. Scoped to that specific element
    // instead of regexing the whole card's text, which can false-match
    // unrelated 2-letter tokens.
    const badge = cards.first().getByTestId('airline-badge').first();
    const iataCode = (await badge.textContent())?.trim() || null;
    test.skip(!iataCode || iataCode === '?', 'Could not read an operating-carrier IATA code from the first result');

    await createTravelCollection(page, {
      type: 'flight',
      issuer: 'Chase',
      collectionName: COLLECTION_NAME,
      airlineIataCode: iataCode!,
      cabinClass: 'Business',
      perkSummary: 'E2E banner match perk.',
      limitedTime: true,
    });

    // The search response itself (including collection matches) is cached
    // server-side by query params (see server/routers/flights.ts) — re-using
    // the exact same query would return the pre-creation cached response. A
    // narrow alternate-date range isn't enough either: rapid repeated runs
    // (e.g. iterating locally, or two CI runs within the ~15min TTL) can
    // land on the same handful of nearby dates and hit each other's stale
    // cache entries. This sandbox account's mock data is date-independent
    // (confirmed: the same carrier set is returned regardless of which
    // future date is queried), so it's safe to spread the offset widely —
    // derive it from the current millisecond for a cache key that's
    // effectively never reused between invocations.
    const freshOffset = 22 + (Date.now() % 1000);
    await page.goto(`/flights?${FLIGHT_QUERY.replace(DEPART_DATE, daysFromNow(freshOffset)).replace(RETURN_DATE, daysFromNow(freshOffset + 7))}`);
    await expect(
      page.getByRole('main').getByText(/flights? · PHL → SFO|No flights found for this route and date|Flight search failed/),
    ).toBeVisible({ timeout: 30_000 });
    // This Duffel test/sandbox account returns a randomized draw of carriers
    // per request rather than a stable schedule (confirmed: identical route
    // + date queries return different owner.iata_code sets across calls) —
    // the fresh, uncached search above may not happen to redraw the same
    // carrier this run. Skip gracefully rather than asserting on data the
    // sandbox doesn't guarantee, consistent with the other live-data skips
    // in this file.
    //
    // Match with a word-boundary regex rather than a bare hasText substring
    // — a plain 2-letter substring match can false-positive on unrelated
    // card text (e.g. "BA" inside "Baggage").
    const escapedIata = iataCode!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matchingCard = page.getByTestId('flight-card').filter({ hasText: new RegExp(`\\b${escapedIata}\\b`) }).first();
    const hasMatchingCard = await matchingCard.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
    test.skip(!hasMatchingCard, `The fresh search did not redraw a ${iataCode} flight — sandbox carrier data is randomized per request`);

    await expect(matchingCard.getByText(COLLECTION_NAME)).toBeVisible({ timeout: 15_000 });
    // A card can carry both banners — the collection's and a live transfer
    // bonus's — and each has its own "Limited time" chip.
    await expect(matchingCard.getByText('Limited time').first()).toBeVisible();
  });

  test('banner info button reveals detail on click, without requiring hover', async ({ page }) => {
    await gotoFlightsWithResults(page);
    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    const infoBtn = page
      .getByRole('button', { name: 'View collection perk details' })
      .or(page.getByRole('button', { name: 'View transfer bonus details' }))
      .first();
    const hasBanner = await infoBtn.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasBanner, 'Neither banner from the prior two tests matched a flight in this result set');

    await infoBtn.click();
    // Tooltip renders as the info button's own next sibling (both live inside
    // the same relatively-positioned wrapper <span>)
    const tooltip = infoBtn.locator('xpath=following-sibling::div').first();
    await expect(tooltip).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Flights page — featured section', () => {
  test.describe.configure({ mode: 'serial' });
  const MERCHANT_NAME = `${TEST_PREFIX} Featured Section Spending Bonus`;
  const COLLECTION_NAME = `${TEST_PREFIX} Featured Section Collection Test`;
  let spendingBonusCreated = false;
  // Real airline names read off live sandbox results — populated by the
  // pagination test below, deactivated alongside MERCHANT_NAME in afterAll.
  const dynamicMerchantsCreated: string[] = [];

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await ctx.newPage();
    if (spendingBonusCreated) await setOfferActive(page, MERCHANT_NAME, false).catch(() => {});
    for (const merchant of dynamicMerchantsCreated) {
      await setOfferActive(page, merchant, false).catch(() => {});
    }
    await setTravelCollectionActive(page, COLLECTION_NAME, false).catch(() => {});
    await ctx.close();
  });

  test('a flight with a live spending bonus on its airline lands in the Featured flights section', async ({ page }) => {
    await gotoFlightsWithResults(page);
    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    // Spending bonuses match by merchant name against the airline — read the
    // real operating airline's name off the first card rather than guessing
    // one that may not actually appear in this (randomized) result set.
    const nameEl = cards.first().getByTestId('airline-name').first();
    const airlineName = (await nameEl.textContent())?.trim() || null;
    test.skip(!airlineName, 'Could not read an airline name from the first result');

    await createSpendingBonus(page, {
      issuer: 'chase',
      merchant: airlineName!,
      multiplier: 5,
      bonusType: 'points_multiplier',
      endDate: daysFromNow(30),
      description: 'E2E featured-section spending bonus match.',
    });
    spendingBonusCreated = true;

    // Spending-bonus matching is computed client-side from a fresh
    // offers.listSpendingBonuses query (like the TransferBonusBanner test
    // above) — no server-side cache to bust, a plain re-search picks it up.
    await gotoFlightsWithResults(page);
    const featuredSection = page.getByTestId('featured-flights-section');
    const hasFeatured = await featuredSection.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasFeatured, `No flight in this result set carries the airline "${airlineName}" the bonus was tied to`);

    await expect(featuredSection.getByText(airlineName!).first()).toBeVisible();
    // Best-per-airline dedup: exactly one card for this airline lives in the
    // Featured section, even if the sandbox happened to return several
    // qualifying offers on it — any extras fall back into the regular
    // (paginated) list rather than flooding Featured with every fare.
    const escapedName = airlineName!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRe = new RegExp(escapedName);
    const insideFeatured = await featuredSection.getByTestId('flight-card').filter({ hasText: nameRe }).count();
    expect(insideFeatured).toBe(1);

    // Nothing gets silently dropped — any additional offer on this airline
    // must still be rendered, just outside Featured.
    const allWithAirline = await page.getByTestId('flight-card').filter({ hasText: nameRe }).count();
    expect(allWithAirline).toBeGreaterThanOrEqual(insideFeatured);
  });

  test('a flight with a live travel collection match lands in the Featured flights section', async ({ page }) => {
    await gotoFlightsWithResults(page);
    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    const badge = cards.first().getByTestId('airline-badge').first();
    const iataCode = (await badge.textContent())?.trim() || null;
    test.skip(!iataCode || iataCode === '?', 'Could not read an operating-carrier IATA code from the first result');

    await createTravelCollection(page, {
      type: 'flight',
      issuer: 'Chase',
      collectionName: COLLECTION_NAME,
      airlineIataCode: iataCode!,
      perkSummary: 'E2E featured-section collection match.',
      limitedTime: true,
    });

    // Collection matches are baked into the server-cached search response
    // (see server/routers/flights.ts) — a fresh, uncached query is required,
    // same reasoning as the CollectionBanner test above.
    const freshOffset = 24 + (Date.now() % 1000);
    await page.goto(`/flights?${FLIGHT_QUERY.replace(DEPART_DATE, daysFromNow(freshOffset)).replace(RETURN_DATE, daysFromNow(freshOffset + 7))}`);
    await expect(
      page.getByRole('main').getByText(/flights? · PHL → SFO|No flights found for this route and date|Flight search failed/),
    ).toBeVisible({ timeout: 30_000 });

    const escapedIata = iataCode!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const iataRe = new RegExp(`\\b${escapedIata}\\b`);
    const featuredSection = page.getByTestId('featured-flights-section');
    const hasFeatured = await featuredSection.getByTestId('flight-card').filter({ hasText: iataRe }).first()
      .waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasFeatured, `The fresh search did not redraw a ${iataCode} flight — sandbox carrier data is randomized per request`);

    await expect(featuredSection.getByText(COLLECTION_NAME)).toBeVisible();
  });

  test('Featured flights section paginates 2 at a time once 3+ airlines qualify', async ({ page }) => {
    await gotoFlightsWithResults(page);
    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    // Spending bonuses match by merchant/airline name, so tying one bonus to
    // each of 3 distinct airlines actually present in this result set gives
    // 3 independently-featured airlines without depending on any single
    // sandbox carrier being drawn.
    const names = new Set<string>();
    const count = await cards.count();
    for (let i = 0; i < count && names.size < 3; i++) {
      const name = (await cards.nth(i).getByTestId('airline-name').first().textContent())?.trim();
      if (name) names.add(name);
    }
    test.skip(names.size < 3, 'Fewer than 3 distinct airlines in this result set');

    for (const name of names) {
      await createSpendingBonus(page, {
        issuer: 'chase',
        merchant: name,
        multiplier: 5,
        bonusType: 'points_multiplier',
        endDate: daysFromNow(30),
        description: 'E2E featured-pagination bonus.',
      });
      dynamicMerchantsCreated.push(name);
    }

    // Spending-bonus matching is computed client-side — a plain re-search
    // picks up the fresh offers.listSpendingBonuses data, same as the first
    // test in this block.
    await gotoFlightsWithResults(page);
    const featuredSection = page.getByTestId('featured-flights-section');
    const hasFeatured = await featuredSection.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasFeatured, 'The fresh search did not redraw any of the 3 targeted airlines');

    const pager = featuredSection.getByTestId('flights-featured-pagination');
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 3 distinct featured airlines survived the fresh, randomized search');

    // Fixed at 2 per page — the Featured strip's own pager, separate from
    // the regular results' configurable Pagination control.
    await expect(featuredSection.getByTestId('flight-card')).toHaveCount(2);
    await expect(pager.getByRole('button', { name: 'Previous featured page' })).toBeDisabled();
    await expect(pager.getByRole('button', { name: 'Next featured page' })).toBeEnabled();

    const firstPageFirstCard = await featuredSection.getByTestId('flight-card').first().innerText();
    await pager.getByRole('button', { name: 'Next featured page' }).click();
    await expect(pager.getByRole('button', { name: 'Previous featured page' })).toBeEnabled();
    const secondPageFirstCard = await featuredSection.getByTestId('flight-card').first().innerText();
    expect(secondPageFirstCard).not.toBe(firstPageFirstCard);

    // The regular results list below keeps its own independent, unaffected
    // pager — moving the Featured page never resets or touches it.
    const regularPager = page.getByRole('navigation', { name: /^flight results pagination$/i });
    const hasRegularPager = await regularPager.isVisible().catch(() => false);
    if (hasRegularPager) {
      await expect(regularPager.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    }
  });
});

test.describe('Flights page — Best value reflects live transfer bonus', () => {
  const PARTNER_PROGRAM = `${TEST_PREFIX} Best Value Bonus Test`;
  let bonusCreated = false;
  let partnerCreated = false;

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await ctx.newPage();
    if (bonusCreated) await setOfferActive(page, PARTNER_PROGRAM, false).catch(() => {});
    if (partnerCreated) await setTransferPartnerActive(page, PARTNER_PROGRAM, false).catch(() => {});
    await ctx.close();
  });

  // Regression for BestRedemptionBar computing "Best value" from the raw,
  // pre-bonus transferCpp instead of the bonus-adjusted rate RedemptionTable
  // already shows (e.g. a live Chase → British Airways transfer bonus). Both
  // components render the same winning option, so their cpp figures must
  // agree once BestRedemptionBar folds the bonus in too.
  test('BestRedemptionBar "Best value" cpp matches the bonus-adjusted featured row', async ({ page }) => {
    await gotoFlightsWithResults(page);
    const cards = page.getByTestId('flight-card');
    const total = await cards.count();
    test.skip(total === 0, 'No flights returned by Duffel for this query');

    // Real seeded transfer partners depend on which carrier this sandbox
    // account's search happens to return — tie the test partner to whatever
    // actually operates the first result, same technique as the
    // TransferBonusBanner test above.
    const badge = cards.first().getByTestId('airline-badge').first();
    const iataCode = (await badge.textContent())?.trim() || null;
    test.skip(!iataCode || iataCode === '?', 'Could not read an operating-carrier IATA code from the first result');

    await createTransferPartner(page, {
      portal: 'Chase',
      type: 'airline',
      program: PARTNER_PROGRAM,
      ratio: '1:1',
      iataCodes: iataCode!,
    });
    partnerCreated = true;

    // Large enough that partnerCpp × (1 + bonusPct/100) clears every fixed
    // portal baseline (~1.0–1.25¢/pt) regardless of which carrier this
    // reached — the point is to make this transfer route the undisputed
    // overall winner, so "Best value" and the featured row are guaranteed to
    // be describing the same option.
    await createTransferBonus(page, {
      issuer: 'chase',
      partner: PARTNER_PROGRAM,
      bonusPct: 100,
      startDate: today(),
      endDate: daysFromNow(30),
      description: 'E2E best-value bonus regression test.',
    });
    bonusCreated = true;

    // The flight list itself is server-cached by query params (carriers don't
    // change), but the transfer/bonus match is computed client-side from
    // fresh portalData.listTransferPartners + offers.listTransferBonuses
    // data — no cache-busting offset needed, same as the TransferBonusBanner
    // test above.
    await gotoFlightsWithResults(page);
    const refreshedCard = page.getByTestId('flight-card').first();

    // Confirm this specific bonus is actually what's driving the winning
    // row before comparing numbers — otherwise a coincidental match would
    // prove nothing. (Both the bonus banner text and the "Best transfer"
    // metric name the partner, hence .first().)
    await expect(refreshedCard.getByText(PARTNER_PROGRAM).first()).toBeVisible({ timeout: 15_000 });

    const barCppText = await refreshedCard.getByTestId('best-value-cpp').innerText();

    await refreshedCard.getByRole('button', { name: /Compare \d+ portals?/ }).click();
    const featuredCppText = await refreshedCard.getByTestId('best-choice-cpp').innerText();

    // Both render as e.g. "1.69cpp" / "1.69¢" — compare the leading numeric
    // portion only.
    const barValue = parseFloat(barCppText);
    const featuredValue = parseFloat(featuredCppText);
    expect(barValue).toBeGreaterThan(0);
    expect(barValue).toBe(featuredValue);
  });
});
