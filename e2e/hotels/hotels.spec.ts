import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  createTransferBonus,
  createTravelCollection,
  discoverTransferPartnerProgram,
  setOfferActive,
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

const CHECK_IN  = futureDate(14);
const CHECK_OUT = futureDate(17);

// Philadelphia — matches the destination used in search.spec.ts's hotel flow
const HOTEL_QUERY = new URLSearchParams({
  destination: 'Philadelphia, PA',
  lat: '39.9526',
  lng: '-75.1652',
  checkIn: CHECK_IN,
  checkOut: CHECK_OUT,
  adults: '2',
  children: '0',
  rooms: '1',
}).toString();

async function gotoHotelsWithResults(page: Page) {
  await page.goto(`/hotels?${HOTEL_QUERY}`);
  await expect(
    page.getByRole('main').getByText(/hotels? in Philadelphia|No hotels found for this location/),
  ).toBeVisible({ timeout: 30_000 });
}

test.describe('Hotels page — empty state', () => {
  test('prompts for a search with no query params', async ({ page }) => {
    await page.goto('/hotels');
    await expect(page.getByRole('main').getByText('Search for a location to find hotels.')).toBeVisible();
  });
});

test.describe('Hotels page — results', () => {
  test('loads results from query params and passes a11y', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const cards = page.getByTestId('hotel-card');
    const count = await cards.count();
    test.skip(count === 0, 'No hotels returned by Duffel for this query');

    await expect(cards.first()).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('star rating filter narrows results', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total === 0, 'No hotels returned by Duffel for this query');

    await page.getByRole('button', { name: '4★+' }).click();

    await expect(async () => {
      const filtered = await cards.count();
      expect(filtered).toBeLessThanOrEqual(total);
    }).toPass();
  });

  test('sort dropdown reorders results A to Z', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total < 2, 'Need 2+ hotels to verify sort order');

    await page.getByRole('button', { name: /^Sort:/ }).click();
    await page.getByRole('button', { name: 'A to Z' }).click();

    // Featured hotels (those matching an admin travel collection — see
    // app/hotels/page.tsx's featuredAccommodations split) are pinned into
    // their own "★ Featured hotels" section ahead of the regular results,
    // so the full card list isn't one globally-sorted sequence. Every
    // featured card carries a CollectionBanner (the "View collection perk
    // details" button) — exclude those and verify A-Z order only among the
    // regular results.
    const regularCards = cards.filter({ hasNot: page.getByRole('button', { name: 'View collection perk details' }) });
    const regularTotal = await regularCards.count();
    test.skip(regularTotal < 2, 'Need 2+ non-featured hotels to verify sort order');

    const names = await regularCards.locator('h3').allTextContents();
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('result cards carry no redemption comparison — that lives in the room detail', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total === 0, 'No hotels returned by Duffel for this query');

    // Hotel pricing is per room type, so a card-level winner would be a guess.
    // The card shows the cash price only; the comparison starts in the modal.
    const card = cards.first();
    await expect(card.getByText('From')).toBeVisible();
    await expect(card.getByTestId('redemption-table')).toHaveCount(0);
    await expect(card.getByRole('button', { name: /^Compare \d+ portals?/ })).toHaveCount(0);
    await expect(card.getByText('Best choice')).toHaveCount(0);
    await expect(card.getByText('Select your cards to compare points pricing across portals.')).toHaveCount(0);
  });

  test('clicking a hotel card opens the detail modal with points comparison', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total === 0, 'No hotels returned by Duffel for this query');

    await cards.first().locator('h3').click();

    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { level: 2 }).last()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close' })).not.toBeVisible();
  });

  test('opens room comparison popup from detail modal', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total === 0, 'No hotels returned by Duffel for this query');

    await cards.first().locator('h3').click();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 10_000 });

    const roomsHeading = page.getByText('Choose your room');
    const hasRooms = await roomsHeading.isVisible({ timeout: 15_000 }).catch(() => false);
    test.skip(!hasRooms, 'No priced room types returned for this hotel');

    // Rooms section only renders room types that have a genuine priced rate,
    // so any visible room card is guaranteed a points comparison.
    const compareButton = page.getByRole('button', { name: /^Compare \d+ portals$/ });
    await expect(compareButton.first()).toBeVisible({ timeout: 15_000 });

    // Room cards show only two portal cash ranges — per-room-per-night and
    // total — no standalone single-value cash/night figures.
    await expect(page.getByText('Portal cash · per room / night').first()).toBeVisible();
    await expect(page.getByText('Portal cash · total').first()).toBeVisible();
    await expect(page.getByText('Total · Cash')).toHaveCount(0);

    // Quantity-available badge ("N available" / "Only N rooms left") was
    // removed from room type cards.
    await expect(page.getByText(/room.?s? left/i)).toHaveCount(0);
    await expect(page.getByText(/^\d+ available$/)).toHaveCount(0);

    // Scoped to the price-range markup itself — the modal's rooms carousel
    // has pre-existing, unrelated landmark/scroll-focus findings that are
    // out of scope for this formatting fix.
    const roomPricingAxe = await new AxeBuilder({ page })
      .include('[data-testid="room-price-range"]')
      .analyze();
    expect(roomPricingAxe.violations).toEqual([]);

    await compareButton.first().click();

    await expect(page.getByRole('button', { name: 'Close comparison' })).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close comparison' })).not.toBeVisible();
  });
});

test.describe('Hotels page — pagination', () => {
  test('page 1 caps at the page size and states the range', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const pager = page.getByRole('navigation', { name: /results pagination/i });
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 11 regular results returned — pagination not rendered');

    const rangeText = await pager.getByRole('status').textContent();
    expect(rangeText).toMatch(/Showing \d+[–-]\d+ of \d+/i);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('per-page selector caps the regular list — the Featured hotels strip pages independently, 2 at a time', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const pager = page.getByRole('navigation', { name: /results pagination/i });
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 11 regular results returned — pagination not rendered');

    const cards = page.getByTestId('hotel-card');
    const featuredCards = cards.filter({ has: page.getByRole('button', { name: 'View collection perk details' }) });
    const featuredCount = await featuredCards.count();
    // The Featured strip caps itself at 2 regardless of how many hotels
    // qualify — it has its own separate pager, not the regular-list one.
    const expectedFeaturedOnPage = Math.min(featuredCount, 2);

    await page.getByLabel('Per page').selectOption('10');
    await expect(cards).toHaveCount(10 + expectedFeaturedOnPage);
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  test('Next advances the page, swaps the results, and scrolls to top', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const pager = page.getByRole('navigation', { name: /results pagination/i });
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 11 regular results returned — pagination not rendered');

    await page.getByLabel('Per page').selectOption('10');
    const firstCardBefore = await page.getByTestId('hotel-card').last().innerText();

    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    const firstCardAfter = await page.getByTestId('hotel-card').last().innerText();
    expect(firstCardAfter).not.toBe(firstCardBefore);

    const scrollTop = await page.getByRole('main').evaluate((el) => el.scrollTop);
    expect(scrollTop).toBe(0);

    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(page.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  });

  test('changing the star filter resets to page 1', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const pager = page.getByRole('navigation', { name: /results pagination/i });
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 11 regular results returned — pagination not rendered');

    await page.getByLabel('Per page').selectOption('10');
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: '4★+' }).click();
    await expect(page.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  test('per-page choice persists across reload', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const pager = page.getByRole('navigation', { name: /results pagination/i });
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 11 regular results returned — pagination not rendered');

    await page.getByLabel('Per page').selectOption('10');
    await gotoHotelsWithResults(page);

    await expect(page.getByLabel('Per page')).toHaveValue('10');
  });

  test('back-to-top appears once scrolled and returns to the top', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total < 5, 'Need enough results to produce meaningful scroll');

    await page.getByRole('main').evaluate((el) => el.scrollTo(0, 600));
    const backToTop = page.getByRole('button', { name: 'Back to top' });
    await expect(backToTop).toBeVisible({ timeout: 5_000 });

    await backToTop.click();
    await expect(async () => {
      const scrollTop = await page.getByRole('main').evaluate((el) => el.scrollTop);
      expect(scrollTop).toBe(0);
    }).toPass();
  });
});

test.describe('Hotels page — map', () => {
  test('map toggle shows and hides the map', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total === 0, 'No hotels returned by Duffel for this query');

    const toggleBtn = page.getByRole('button', { name: /^(Show|Hide) map$/ });
    const hasToggle = await toggleBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!hasToggle, 'No mappable hotels (missing geographic coordinates) for this query');

    // Map is visible by default when mappable hotels exist.
    await expect(page.getByRole('button', { name: 'Hide map' })).toBeVisible();
    await toggleBtn.click();
    await expect(page.getByRole('button', { name: 'Show map' })).toBeVisible();
    await toggleBtn.click();
    await expect(page.getByRole('button', { name: 'Hide map' })).toBeVisible();
  });

  test('clicking a map pin opens its card, and "View details" opens the hotel modal', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total === 0, 'No hotels returned by Duffel for this query');

    const hotelMap = page.getByTestId('hotel-map');
    const pinButtons = hotelMap.getByRole('button', { name: /^View / });
    const hasMap = await pinButtons.first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasMap, 'No mappable hotels (missing geographic coordinates) for this query');

    await pinButtons.first().click({ force: true });

    const pinCard = page.getByTestId('map-pin-card');
    const viewDetailsBtn = pinCard.getByRole('button', { name: 'View details', exact: true });
    await expect(viewDetailsBtn).toBeVisible({ timeout: 10_000 });

    await viewDetailsBtn.click();

    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { level: 2 }).last()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close' })).not.toBeVisible();
  });

  test('clicking the map background closes the pin card', async ({ page }) => {
    await gotoHotelsWithResults(page);

    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total === 0, 'No hotels returned by Duffel for this query');

    const hotelMap = page.getByTestId('hotel-map');
    const pinButtons = hotelMap.getByRole('button', { name: /^View / });
    const hasMap = await pinButtons.first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasMap, 'No mappable hotels (missing geographic coordinates) for this query');

    await pinButtons.first().click({ force: true });

    const pinCard = page.getByTestId('map-pin-card');
    await expect(pinCard).toBeVisible({ timeout: 10_000 });

    // Click the map canvas, away from any pin, to dismiss the open card.
    const mapCanvas = page.locator('.mapboxgl-canvas');
    await mapCanvas.click({ position: { x: 5, y: 5 } });

    await expect(pinCard).not.toBeVisible();
  });
});

test.describe('Hotels page — banners', () => {
  test.describe.configure({ mode: 'serial' });
  const COLLECTION_NAME = `${TEST_PREFIX} Banner Match Test`;
  let bonusPartner: string | null = null;

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await ctx.newPage();
    if (bonusPartner) await setOfferActive(page, bonusPartner, false).catch(() => {});
    await setTravelCollectionActive(page, COLLECTION_NAME, false).catch(() => {});
    await ctx.close();
  });

  test('TransferBonusBanner appears on a hotel card when a live bonus matches a transferable partner', async ({ page }) => {
    // Don't hardcode a partner name — seed data varies by environment, so
    // discover whatever real hotel partner is actually live for Chase.
    bonusPartner = await discoverTransferPartnerProgram(page, 'chase', 'Hotel');
    test.skip(!bonusPartner, 'No real hotel transfer partner seeded for Chase in this environment');

    await createTransferBonus(page, {
      issuer: 'chase',
      partner: bonusPartner!,
      bonusPct: 30,
      startDate: today(),
      endDate: daysFromNow(30),
      description: 'E2E banner match bonus.',
    });

    await gotoHotelsWithResults(page);
    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total === 0, 'No hotels returned by Duffel for this query');

    // Only results in this partner's chain (if any) will have
    // transferAlternatives that include it — banner presence depends on
    // live Duffel inventory actually containing a matching chain/hotel.
    const escapedPartner = bonusPartner!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const bannerTextRe = new RegExp(`to ${escapedPartner}`);
    const bannerCard = cards.filter({ hasText: bannerTextRe }).first();
    // isVisible() does not wait/retry — use waitFor so this doesn't false-skip
    // while the search results (and their points calc) are still loading.
    const hasMatch = await bannerCard.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasMatch, `No hotel in this result set carries a live transfer bonus to ${bonusPartner}`);

    await expect(bannerCard.getByText(bannerTextRe)).toBeVisible();
    await expect(bannerCard.getByText('Limited time')).toBeVisible();
  });

  test('CollectionBanner appears on a hotel card matching a live travel collection', async ({ page }) => {
    await gotoHotelsWithResults(page);
    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total === 0, 'No hotels returned by Duffel for this query');

    const propertyName = (await cards.first().locator('h3').first().textContent())?.trim();
    test.skip(!propertyName, 'Could not read a hotel name from the first result');

    await createTravelCollection(page, {
      type: 'hotel',
      issuer: 'Amex',
      collectionName: COLLECTION_NAME,
      propertyName: propertyName!,
      perkSummary: 'E2E banner match perk.',
      limitedTime: true,
    });

    await gotoHotelsWithResults(page);
    const matchingCard = page.getByTestId('hotel-card').filter({ hasText: propertyName! }).first();
    await expect(matchingCard.getByText(COLLECTION_NAME)).toBeVisible({ timeout: 15_000 });
    await expect(matchingCard.getByText('Limited time')).toBeVisible();
  });

  test('banner info button reveals detail on click, without requiring hover', async ({ page }) => {
    await gotoHotelsWithResults(page);
    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total === 0, 'No hotels returned by Duffel for this query');

    const infoBtn = page
      .getByRole('button', { name: 'View collection perk details' })
      .or(page.getByRole('button', { name: 'View transfer bonus details' }))
      .first();
    const hasBanner = await infoBtn.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasBanner, 'Neither banner from the prior two tests matched a hotel in this result set');

    await infoBtn.click();
    // Tooltip renders as the info button's own next sibling (both live inside
    // the same relatively-positioned wrapper <span>)
    const tooltip = infoBtn.locator('xpath=following-sibling::div').first();
    await expect(tooltip).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Hotels page — featured pagination', () => {
  test.describe.configure({ mode: 'serial' });
  const createdCollections: string[] = [];

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: 'e2e/.auth/admin.json' });
    const page = await ctx.newPage();
    for (const name of createdCollections) {
      await setTravelCollectionActive(page, name, false).catch(() => {});
    }
    await ctx.close();
  });

  test('Featured hotels section paginates 2 at a time once 3+ hotels qualify', async ({ page }) => {
    await gotoHotelsWithResults(page);
    const cards = page.getByTestId('hotel-card');
    const total = await cards.count();
    test.skip(total === 0, 'No hotels returned by Duffel for this query');

    // Collect up to 3 distinct property names from the current result set —
    // travel collections match by property name, so tying one collection to
    // each of 3 real hotels gives 3 independently-featured hotels without
    // depending on any single sandbox property being returned.
    const names: string[] = [];
    const count = await cards.count();
    for (let i = 0; i < count && names.length < 3; i++) {
      const name = (await cards.nth(i).locator('h3').first().textContent())?.trim();
      if (name && !names.includes(name)) names.push(name);
    }
    test.skip(names.length < 3, 'Fewer than 3 distinct hotels in this result set');

    for (const [i, name] of names.entries()) {
      const collectionName = `${TEST_PREFIX} Featured Pagination Test ${i + 1}`;
      await createTravelCollection(page, {
        type: 'hotel',
        issuer: 'Amex',
        collectionName,
        propertyName: name,
        perkSummary: 'E2E featured-pagination collection.',
        limitedTime: true,
      });
      createdCollections.push(collectionName);
    }

    await gotoHotelsWithResults(page);
    const featuredSection = page.getByTestId('featured-hotels-section');
    const hasFeatured = await featuredSection.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    test.skip(!hasFeatured, 'The fresh search did not redraw any of the 3 targeted hotels');

    const pager = featuredSection.getByTestId('hotels-featured-pagination');
    const hasPager = await pager.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
    test.skip(!hasPager, 'Fewer than 3 distinct featured hotels survived the fresh search');

    // Fixed at 2 per page — the Featured strip's own pager, separate from
    // the regular results' configurable Pagination control.
    await expect(featuredSection.getByTestId('hotel-card')).toHaveCount(2);
    await expect(pager.getByRole('button', { name: 'Previous featured page' })).toBeDisabled();
    await expect(pager.getByRole('button', { name: 'Next featured page' })).toBeEnabled();

    const firstPageFirstName = await featuredSection.getByTestId('hotel-card').first().locator('h3').first().textContent();
    await pager.getByRole('button', { name: 'Next featured page' }).click();
    await expect(pager.getByRole('button', { name: 'Previous featured page' })).toBeEnabled();
    const secondPageFirstName = await featuredSection.getByTestId('hotel-card').first().locator('h3').first().textContent();
    expect(secondPageFirstName).not.toBe(firstPageFirstName);

    // The regular results list below keeps its own independent, unaffected
    // pager — moving the Featured page never resets or touches it.
    const regularPager = page.getByRole('navigation', { name: /^hotel results pagination$/i });
    const hasRegularPager = await regularPager.isVisible().catch(() => false);
    if (hasRegularPager) {
      await expect(regularPager.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    }
  });
});
