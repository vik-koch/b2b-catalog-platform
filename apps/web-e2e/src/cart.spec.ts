import { expect, Page, test } from '@playwright/test';

/**
 * FR-UNIT-07, FR-CART-01/08. The cart lives in localStorage and is priced by
 * the API, so what only a browser can show is the round trip: a choice made on
 * a product page reaches the header, survives a reload, and is priced by the
 * server rather than by the page that stored it.
 *
 * `hafen-espresso` is seeded packaged — six to a pack, four packs to a box, a
 * six-piece minimum. `cappuccino-cup-set` is the seeded product with a line
 * note enabled.
 */

const cartLink = (page: Page) => page.getByRole('link', { name: /^Cart/ });

/** Each cart line is a list item carrying a link to its product. */
const lines = (page: Page) =>
  page.locator('li:has(a[href^="/product/"])').filter({ hasText: /\d/ });

test.beforeEach(async ({ page }) => {
  // Every spec starts from an empty cart; nothing else clears it, by design.
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('cart'));
});

test('adds a chosen unit to the cart, counts it in the header, and keeps it', async ({
  page,
}) => {
  await page.goto('/product/hafen-espresso');

  const units = page.getByRole('radiogroup', { name: 'Unit' });
  // The segments name the unit and nothing else; what a pack holds is stated
  // once, by the packaging line under the control.
  await expect(units.getByText('Pack', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Packaging: 4 pk × 6 pcs = 24 pcs'),
  ).toBeVisible();
  await units.getByText('Box', { exact: true }).click();
  await page.getByRole('button', { name: 'Add to cart' }).click();

  // The button is gone once the product is in the cart: what stands in its
  // place is what the line now costs.
  await expect(page.getByText(/Added for/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add to cart' })).toHaveCount(
    0,
  );
  await expect(cartLink(page)).toHaveAttribute(
    'aria-label',
    /Cart: 1 lines, .+/,
  );

  // The whole point of storing it: it is still there on the next visit.
  await page.reload();
  await expect(cartLink(page)).toHaveAttribute(
    'aria-label',
    /Cart: 1 lines, .+/,
  );

  await cartLink(page).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(lines(page)).toHaveCount(1);
  await expect(page.getByText('1 × Box')).toBeVisible();
});

test('corrects a piece quantity to one the shop can supply, and says so', async ({
  page,
}) => {
  await page.goto('/product/hafen-espresso');

  // By role, not by label: the steppers beside it are named "… the quantity".
  const quantity = page.getByRole('textbox', { name: 'Quantity' });
  await quantity.fill('14');
  await page.getByRole('button', { name: 'Add to cart' }).click();

  await expect(page.getByText('14 adjusted to 18 pcs')).toBeVisible();
  await cartLink(page).click();
  await expect(page.getByText('18 × Piece')).toBeVisible();
});

test('sells from a grid card, and then edits that line from it', async ({
  page,
}) => {
  await page.goto('/catalog/espresso');

  const card = page
    .locator('li')
    .filter({ has: page.locator('a[href="/product/hafen-espresso"]') })
    .first();
  await card.getByRole('button', { name: 'Add to cart' }).click();
  await expect(card.getByText(/Added for/)).toBeVisible();
  await expect(cartLink(page)).toHaveAttribute(
    'aria-label',
    /Cart: 1 lines, .+/,
  );

  // The stepper now edits the line rather than describing a second one.
  await card.getByRole('button', { name: 'Increase the quantity' }).click();
  await expect(cartLink(page)).toHaveAttribute(
    'aria-label',
    /Cart: 1 lines, .+/,
  );
  await cartLink(page).click();
  await expect(lines(page)).toHaveCount(1);
  await expect(page.getByText('12 × Piece')).toBeVisible();
});

test('carries a line note through to the cart', async ({ page }) => {
  await page.goto('/product/cappuccino-cup-set');

  // The prompt is the product's own, not a generic one.
  await expect(page.getByText('Which glaze colours?')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Note' })
    .fill('Three sand, three slate');
  await page.getByRole('button', { name: 'Add to cart' }).click();

  await cartLink(page).click();
  await expect(page.getByText('Three sand, three slate')).toBeVisible();
});

test('prices the cart on the server and empties it when asked', async ({
  page,
}) => {
  await page.goto('/product/hafen-espresso');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/product/cappuccino-cup-set');
  await page.getByRole('button', { name: 'Add to cart' }).click();

  await cartLink(page).click();
  await expect(lines(page)).toHaveCount(2);
  // A subtotal only exists because the API priced what the browser sent.
  await expect(page.getByText('Subtotal')).toBeVisible();

  // Emptying is confirmed in the app's own modal, not a browser dialog.
  await page.getByRole('button', { name: 'Empty the cart' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Empty the cart' }).click();

  await expect(page.getByText('Your cart is empty.')).toBeVisible();
  await expect(cartLink(page)).toHaveAttribute('aria-label', /Cart: 0 lines/);
});
