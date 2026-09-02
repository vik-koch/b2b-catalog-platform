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

/** `cart.issues.quantityCorrected` in the demo text — one sentence, whatever
 * was rounded and whichever unit it was typed in. */
const CORRECTED = 'The quantity was adjusted to the nearest we can supply.';

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
  // The cart line carries the same controls the product page did, holding the
  // choice that was made there.
  await expect(page.getByRole('radio', { name: 'Box' })).toBeChecked();
  // The minimum is six pieces, and a box holds 24 — so a quarter of one. The
  // unit says how the quantity is read, never what it is.
  await expect(page.getByRole('textbox', { name: 'Quantity' })).toHaveValue(
    '0,25',
  );
});

test('re-reads a quantity in another unit without asking anything', async ({
  page,
}) => {
  await page.goto('/product/hafen-espresso');

  const units = page.getByRole('radiogroup', { name: 'Unit' });
  const quantity = page.getByRole('textbox', { name: 'Quantity' });
  await units.getByText('Pack', { exact: true }).click();
  // Both waits are for hydration, not for the app: a press or a keystroke that
  // lands on the server's HTML before the listeners are attached is simply
  // lost, and the next step then reads the field in a unit that never changed.
  // The field, not the radio: a press before hydration ticks the radio itself
  // — that is the browser's own doing — while the six pieces behind it are
  // still read as pieces. One pack is what the minimum becomes once the app
  // has the press.
  await expect(quantity).toHaveValue('1');
  await quantity.fill('2');
  await expect(quantity).toHaveValue('2');
  await units.getByText('Box', { exact: true }).click();

  // Two packs of the four a box holds. Nothing was rounded, so nothing is
  // announced — the prompt this replaced asked to round it up to a whole box.
  await expect(quantity).toHaveValue('0,5');
  await expect(page.getByText(CORRECTED)).toHaveCount(0);

  await page.getByRole('button', { name: 'Add to cart' }).click();
  await cartLink(page).click();
  await expect(page.getByRole('textbox', { name: 'Quantity' })).toHaveValue(
    '0,5',
  );
});

test('corrects a piece quantity to one the shop can supply, and says so', async ({
  page,
}) => {
  await page.goto('/product/hafen-espresso');

  // By role, not by label: the steppers beside it are named "… the quantity".
  const quantity = page.getByRole('textbox', { name: 'Quantity' });
  await quantity.fill('14');
  await page.getByRole('button', { name: 'Add to cart' }).click();

  await expect(page.getByText(CORRECTED)).toBeVisible();
  await cartLink(page).click();
  await expect(page.getByRole('textbox', { name: 'Quantity' })).toHaveValue(
    '18',
  );
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
  await expect(page.getByRole('textbox', { name: 'Quantity' })).toHaveValue(
    '12',
  );
});

test('carries a line note through to the cart', async ({ page }) => {
  await page.goto('/product/cappuccino-cup-set');

  // The prompt is the product's own, not a generic one, and it is what the
  // empty field asks for rather than a line under it.
  const note = page.getByRole('textbox', { name: 'Note' });
  await expect(note).toHaveAttribute(
    'placeholder',
    'Which glaze colours? Sand, slate or off-white.',
  );
  await note.fill('Three sand, three slate');
  await page.getByRole('button', { name: 'Add to cart' }).click();

  await cartLink(page).click();
  // On the cart the note is a field, not a sentence: it is read there before
  // the order goes in, and changed in the same place.
  await expect(page.getByRole('textbox', { name: /Note/ })).toHaveValue(
    'Three sand, three slate',
  );
});

// On a card there is no room for a field, so the note lives behind a button
// beside the price — and what is written there rides with the line.
test('writes a note from a listing card, beside the price', async ({
  page,
  isMobile,
}) => {
  await page.goto('/search?q=Cappuccino');

  const card = page
    .locator('li')
    .filter({ has: page.locator('a[href="/product/cappuccino-cup-set"]') })
    .first();
  await card.getByRole('button', { name: /note/i }).click();
  // The same field in the shape the width allows: a bubble beside the price
  // where there is room beside anything, a modal on a phone — which is closed
  // by its own button rather than by leaving the field.
  const panel = isMobile
    ? page.getByRole('dialog')
    : page.locator('app-popover');
  const field = panel.getByRole('textbox');
  await expect(field).toHaveAttribute(
    'placeholder',
    'Which glaze colours? Sand, slate or off-white.',
  );

  await field.fill('Sand only');
  if (isMobile) {
    await panel.getByRole('button', { name: 'Done' }).click();
  } else {
    await field.blur();
  }
  await card.getByRole('button', { name: 'Add to cart' }).click();

  await expect(cartLink(page)).toHaveAttribute('aria-label', /Cart: 1 lines/);
  await cartLink(page).click();
  await expect(page.getByRole('textbox', { name: /Note/ })).toHaveValue(
    'Sand only',
  );
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

  // Emptying is ticking every line and deleting the selection, confirmed in
  // the app's own modal rather than a browser dialog.
  await page.getByRole('checkbox', { name: 'Select all' }).check();
  await page.getByRole('button', { name: 'Delete selection' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Delete selection' }).click();

  await expect(page.getByText('Your cart is empty.')).toBeVisible();
  await expect(cartLink(page)).toHaveAttribute('aria-label', /Cart: 0 lines/);
});
