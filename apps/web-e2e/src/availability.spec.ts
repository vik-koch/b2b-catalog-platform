import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/*
 * Stock availability on the storefront and in the editor (FR-STOCK-01/02/03).
 *
 * What is left for a real browser is what a test DOM cannot answer: the badge
 * reserves its line in a listing, so names stay level whether or not a product
 * is tracked, and the editor previews the badge a figure will produce while it
 * is being typed. The refusal to sell an empty shelf (FR-STOCK-04) is
 * cart.spec's; the ordering (FR-STOCK-05) is api-e2e's.
 *
 * Read-only — the editor is opened and left without saving, as
 * catalog-editing.spec does.
 */

/** The cups category: one product with a figure, one without — the mix the
 * reserved line exists for. */
const LISTING = '/catalog/cups';
const TRACKED = 'Cappuccino Cup Set (6)';
const UNTRACKED = 'Latte Glass Set (6)';
/** Seeded with four pieces, under every threshold in the catalog. */
const LOW_STOCK = 'barista-reserve';

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** The height of a card's badge slot — what the reserved line is, and what
 * keeps the names under it level. Measured rather than compared by position,
 * so the assertion holds on a phone, where the cards are one per row. */
async function badgeSlot(page: Page, name: string): Promise<number> {
  const box = await page
    .locator('li')
    .filter({ hasText: name })
    .first()
    .locator('app-product-availability-badge')
    .boundingBox();
  if (!box) throw new Error(`no badge slot on the card for ${name}`);
  return Math.round(box.height);
}

test.describe('availability on the storefront', () => {
  test('badges what is on the shelf and keeps untracked names level', async ({
    page,
  }) => {
    await page.goto(LISTING);

    await expect(page.getByText('In stock')).toHaveCount(1);
    // The untracked product shows nothing at all — an empty state is not a
    // state, and a deployment that enters no figures sees no badges anywhere.
    const untracked = page.locator('li').filter({ hasText: UNTRACKED });
    await expect(
      untracked.getByText(/In stock|Few left|Out of stock/),
    ).toHaveCount(0);

    // …but its card still leaves the line, because a neighbour has a badge:
    // the slot is exactly as tall as the pill it is holding space for.
    expect(await badgeSlot(page, UNTRACKED)).toBe(
      await badgeSlot(page, TRACKED),
    );
  });

  test('says on the product page when there are only a few left', async ({
    page,
  }) => {
    await page.goto(`/product/${LOW_STOCK}`);

    await expect(page.getByText('Few left')).toBeVisible();
    // Nothing is refused — "few left" restricts nothing (FR-STOCK-04).
    await expect(
      page.getByRole('button', { name: 'Add to cart' }),
    ).toBeEnabled();
  });
});

test.describe('the stock fields in the product editor', () => {
  test('previews the badge a figure will produce, before anything is saved', async ({
    page,
  }) => {
    await logIn(page);
    await page.goto(`/admin/products/${LOW_STOCK}/edit`);

    const pieces = page.getByLabel('Pieces on hand');
    await expect(pieces).toHaveValue('4');
    const preview = page
      .locator('p')
      .filter({ hasText: 'Customers currently see:' });
    await expect(preview.getByText('Few left')).toBeVisible();

    // Restocked: the preview follows the field, so the admin sees the badge
    // they are about to publish rather than the one the product has.
    await pieces.fill('400');
    await expect(preview.getByText('In stock')).toBeVisible();

    await pieces.fill('0');
    await expect(preview.getByText('Out of stock')).toBeVisible();

    // Cleared: no figure is no badge, and the threshold has nothing to modify.
    await pieces.fill('');
    await expect(
      preview.getByText("Nothing — this product's stock is not tracked."),
    ).toBeVisible();
    await expect(page.getByLabel('“Few left” below')).toBeDisabled();

    // Left without saving: this suite shares its database with the specs that
    // assert the seeded catalog, so the editor is only ever looked at.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Discard changes' }).click();
    await expect(page).not.toHaveURL(/\/edit$/);
  });
});
