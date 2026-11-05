import { expect, Page, test } from '@playwright/test';

/**
 * FR-UNIT-07, FR-CART-01/08: a product page's choice reaches the header,
 * survives a reload and is priced by the server. `hafen-espresso` is six to a
 * pack, four packs to a box, a six-piece minimum; `stoneware-cup-set` takes a
 * line note.
 */

const cartLink = (page: Page) => page.getByRole('link', { name: /^Cart/ });

/** `cart.issues.quantityCorrected` in the demo text: one sentence for any
 * rounding and unit. */
const CORRECTED = 'The quantity was adjusted to the nearest we can supply.';

/** Each cart line is a list item carrying a link to its product. */
const lines = (page: Page) =>
  page.locator('li:has(a[href^="/product/"])').filter({ hasText: /\d/ });

test.beforeEach(async ({ page }) => {
  // Every spec starts from an empty cart; nothing else clears it, by design.
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('cart'));
});

// The server draws buy controls for an empty cart; hydrating a carted one
// replaces them, never stacks "Added" on "Add to cart".
test('a cold load never shows a carted product both ways at once', async ({
  page,
}) => {
  // The main page's row, where it was seen. `takeaway-cup-lid-set-400` is
  // seeded featured and in stock, so it is in every draw of the row.
  await page.goto('/product/takeaway-cup-lid-set-400');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText(/Added for/)).toBeVisible();

  // Before any of the page exists: note every moment one set of controls
  // holds both the button and the label.
  await page.addInitScript(() => {
    const w = window as unknown as { doubled: boolean };
    w.doubled = false;
    new MutationObserver(() => {
      for (const controls of document.querySelectorAll(
        'app-product-buy-controls',
      )) {
        const button = [...controls.querySelectorAll('button')].some((b) =>
          (b.textContent ?? '').includes('Add to cart'),
        );
        if (button && controls.querySelector('p[role=status]')) {
          w.doubled = true;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });

  // More than one load, because the doubled moment is a race with hydration
  // and a single load does not always lose it.
  for (let load = 0; load < 3; load++) {
    await page.goto('/');
    await expect(page.getByText(/Added for/)).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { doubled: boolean }).doubled,
      ),
    ).toBe(false);
  }
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
    /^Cart: .+, lines: 1$/,
  );

  // The whole point of storing it: it is still there on the next visit.
  await page.reload();
  await expect(cartLink(page)).toHaveAttribute(
    'aria-label',
    /^Cart: .+, lines: 1$/,
  );

  await cartLink(page).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(lines(page)).toHaveCount(1);
  // The cart line carries the same controls the product page did, holding the
  // choice that was made there.
  await expect(page.getByRole('radio', { name: 'Box' })).toBeChecked();
  // Six pieces of a 24-piece box is a quarter: the unit reads the quantity,
  // never sets it.
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
  // Both waits are for hydration: a press on the server's HTML is lost. The
  // field, not the radio, which the browser ticks before hydration while the
  // six pieces still read as pieces; with the app, the minimum is one pack.
  await expect(quantity).toHaveValue('1');
  await quantity.fill('2');
  await expect(quantity).toHaveValue('2');
  await units.getByText('Box', { exact: true }).click();

  // Two packs of the four a box holds: nothing rounded, nothing announced.
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
    /^Cart: .+, lines: 1$/,
  );

  // The stepper now edits the line rather than describing a second one.
  await card.getByRole('button', { name: 'Increase the quantity' }).click();
  await expect(cartLink(page)).toHaveAttribute(
    'aria-label',
    /^Cart: .+, lines: 1$/,
  );
  await cartLink(page).click();
  await expect(lines(page)).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Quantity' })).toHaveValue(
    '12',
  );
});

test('carries a line note through to the cart', async ({ page }) => {
  await page.goto('/product/stoneware-cup-set');

  // The prompt is the product's own, not a generic one, and it is what the
  // empty field asks for rather than a line under it.
  const note = page.getByRole('textbox', { name: 'Note' });
  await expect(note).toHaveAttribute(
    'placeholder',
    'Which glazes, and how many of each?',
  );
  await note.fill('Three terracotta, three mustard');
  await page.getByRole('button', { name: 'Add to cart' }).click();

  await cartLink(page).click();
  // On the cart the note is a field, not a sentence: it is read there before
  // the order goes in, and changed in the same place.
  await expect(page.getByRole('textbox', { name: /Note/ })).toHaveValue(
    'Three terracotta, three mustard',
  );
});

// A card has no room for a field, so the note sits behind a button by the
// price and rides with the line.
test('writes a note from a listing card, beside the price', async ({
  page,
  isMobile,
}) => {
  await page.goto('/search?q=Stoneware');

  const card = page
    .locator('li')
    .filter({ has: page.locator('a[href="/product/stoneware-cup-set"]') })
    .first();
  await card.getByRole('button', { name: /note/i }).click();
  // The field as the width allows: a bubble by the price, a modal on a phone,
  // closed by its own button.
  const panel = isMobile
    ? page.getByRole('dialog')
    : page.locator('ui-popover');
  const field = panel.getByRole('textbox');
  await expect(field).toHaveAttribute(
    'placeholder',
    'Which glazes, and how many of each?',
  );

  await field.fill('Terracotta only');
  if (isMobile) {
    await panel.getByRole('button', { name: 'Done' }).click();
  } else {
    await field.blur();
  }
  await card.getByRole('button', { name: 'Add to cart' }).click();

  await expect(cartLink(page)).toHaveAttribute(
    'aria-label',
    /^Cart: .+, lines: 1$/,
  );
  await cartLink(page).click();
  await expect(page.getByRole('textbox', { name: /Note/ })).toHaveValue(
    'Terracotta only',
  );
});

test('prices the cart on the server and empties it when asked', async ({
  page,
}) => {
  await page.goto('/product/hafen-espresso');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/product/stoneware-cup-set');
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
  await expect(cartLink(page)).toHaveAttribute(
    'aria-label',
    /^Cart: .+, lines: 0$/,
  );
});

/** FR-STOCK-04. `nordic-pull` is seeded out of stock, packaged like
 * `hafen-espresso`: listed and priced, without a way into the cart. */
test('will not sell a product that is out of stock', async ({ page }) => {
  await page.goto('/product/nordic-pull');

  await expect(page.getByText('Out of stock')).toBeVisible();
  // Priced, as the requirement says: what is refused is the buying.
  await expect(page.getByText('On request')).toHaveCount(0);

  // No unit is selectable: disabled buttons, nothing to choose or explain.
  await expect(page.getByRole('radio')).toHaveCount(0);
  const units = page.getByRole('radiogroup', { name: 'Unit' });
  await expect(units.getByRole('button', { name: 'Pack' })).toBeDisabled();

  await expect(page.getByRole('textbox', { name: 'Quantity' })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Increase the quantity' }),
  ).toBeDisabled();
  const add = page.getByRole('button', { name: 'Add to cart' });
  await expect(add).toBeDisabled();

  // And the same refusal on the listing the product is reached through, where
  // its neighbours are still perfectly buyable.
  await page.goto('/search?q=Nordic+Pull');
  const card = page
    .locator('li')
    .filter({ has: page.locator('a[href="/product/nordic-pull"]') })
    .first();
  await expect(card.getByText('Out of stock')).toBeVisible();
  await expect(
    card.getByRole('button', { name: 'Add to cart' }),
  ).toBeDisabled();

  await expect(cartLink(page)).toHaveAttribute(
    'aria-label',
    /^Cart: .+, lines: 0$/,
  );
});

/** FR-CART-10 over FR-STOCK-04: a cart from before the shelf emptied. The
 * line is stored by hand, as the shop no longer lets it be added. */
test('says on return that a line went out of stock while the cart waited', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem(
      'cart',
      JSON.stringify({
        version: 2,
        pricedFor: null,
        lines: [
          {
            slug: 'nordic-pull',
            unit: 'pack',
            pieces: 6,
            note: null,
            name: 'Nordic Pull',
            addedAt: new Date().toISOString(),
            unitPriceMinor: 12_060,
            lineTotalMinor: 12_060,
            prices: {
              piece: 2_010,
              pack: 12_060,
              box: 48_240,
            },
            packaging: { piecesPerPack: 6, packsPerBox: 4, minPieceQty: 6 },
            image: null,
            boxVolume: null,
            boxWeight: null,
            boxCount: null,
            noteEnabled: false,
            notePrompt: null,
            available: true,
            // What the shop said when the line was written down.
            availability: 'in',
          },
        ],
      }),
    );
  });

  await page.goto('/cart');

  await expect(
    page.getByText(
      'Nordic Pull is out of stock and cannot be ordered right now.',
    ),
  ).toBeVisible();
  // And the line itself says what to do about it, beside controls that no
  // longer do anything.
  await expect(
    page.getByText(
      'Out of stock — please remove this line to place your order.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Quantity' })).toBeDisabled();
});
