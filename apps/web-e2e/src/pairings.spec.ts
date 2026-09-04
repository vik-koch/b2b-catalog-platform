import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/*
 * Sold-together pairings: the editor that makes them (FR-SET-01), and the
 * marker that spends them (FR-SET-05).
 *
 * What is left for a real browser is what a test DOM cannot answer: the
 * editor's picker, which asks the catalog as it is typed, and the storefront's
 * panel, which is a modal full of product rows and has to hold at a phone's
 * width. The mutuality and the refusals are api-e2e's; the filtering rules and
 * the marker's placements are the component specs'.
 *
 * The editor is read-only here — opened and left without saving, as
 * catalog-editing.spec does.
 */

/** The seeded pair: a takeaway cup and the two lids that fit it. */
const CUP = 'takeaway-cup-300';
const LID_FLAT = 'Takeaway Lid, Flat (50)';
const LID_DOMED = 'Takeaway Lid, Domed (50)';
/** A product nothing is paired with. */
const UNPAIRED = 'latte-glass-set';
/** The panel's own name, `catalog.pairings.label` in the demo text. */
const PANEL = 'Sold together';

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('product pairings', () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page);
  });

  test('opens on the counterparts a product already has', async ({ page }) => {
    await page.goto(`/admin/products/${CUP}/edit`);

    // Open on arrival, because there is something to see: both lids, by name.
    await expect(page.getByText(LID_FLAT)).toBeVisible();
    await expect(page.getByText(LID_DOMED)).toBeVisible();
  });

  test('suggests products by name and lists the one picked', async ({
    page,
  }) => {
    await page.goto(`/admin/products/${UNPAIRED}/edit`);

    // Closed, and the lid says so — nothing is paired with this one.
    const toggle = page.getByRole('button', { name: 'Sold together' });
    await expect(toggle).toBeVisible();
    await expect(page.getByLabel('Add a product')).toBeHidden();
    await toggle.click();

    await page.getByLabel('Add a product').fill('Takeaway Lid');
    const option = page.getByRole('option', { name: LID_FLAT });
    await expect(option).toBeVisible();
    await option.click();

    // Listed with a way to undo it, and the field is empty for the next one.
    await expect(
      page.getByRole('button', { name: `Remove “${LID_FLAT}”` }),
    ).toBeVisible();
    await expect(page.getByLabel('Add a product')).toHaveValue('');

    // Nothing is saved until the editor is: leaving discards it.
    await page.reload();
    await expect(page.getByText(LID_FLAT)).toBeHidden();
  });
});

/*
 * The storefront half (FR-SET-05): the marker wherever a product is drawn, and
 * the panel behind it — counterparts with their own buying controls, so they
 * can be added from where the marker was pressed.
 *
 * Signed out, because a pairing is not a session concern; both viewports,
 * because the panel is one drawing at both and the phone is where a modal full
 * of product rows is worth checking.
 */
test.describe('the sold-together marker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('cart'));
  });

  test('opens the counterparts from a listing card, and adds one', async ({
    page,
  }) => {
    await page.goto('/catalog/cups');

    // The glyph, in the price row beside where a note's bubble would be. Its
    // accessible name is the count, since a card has no line to spare for one.
    const card = page.locator('li').filter({ hasText: 'Takeaway Cup 300' });
    await card.getByRole('button', { name: /Sold together with 2/ }).click();

    const panel = page.getByRole('dialog');
    await expect(panel.getByText(LID_FLAT)).toBeVisible();
    await expect(panel.getByText(LID_DOMED)).toBeVisible();

    // A product row, so a lid is added from here rather than by going to find
    // it.
    await panel
      .locator('li')
      .filter({ hasText: LID_FLAT })
      .getByRole('button', { name: 'Add to cart' })
      .click();
    // The header's link states the count in its accessible name, not on
    // screen (`cart.summaryLabel` in the demo text).
    await expect(
      page.getByRole('link', { name: /^Cart: 1 line/ }),
    ).toBeVisible();

    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toBeHidden();
  });

  test('names the panel on the product page, and again on the cart line', async ({
    page,
  }) => {
    await page.goto(`/product/${CUP}`);

    // With the word here: there is a line to spare, and the panel is worth
    // naming before it is pressed.
    const link = page.getByRole('button', { name: PANEL, exact: true });
    await expect(link).toBeVisible();
    await link.click();
    const panel = page.getByRole('dialog');
    await expect(panel.getByText(LID_DOMED)).toBeVisible();
    // The rows inside carry no marker of their own: the counterpart of a lid
    // is the cup that opened this.
    await expect(
      panel.getByRole('button', { name: /Sold together with/ }),
    ).toHaveCount(0);
    // Added from the panel, where the marker was pressed. The cup itself is
    // seeded out of stock, which is the point of adding the lid instead: the
    // panel sells what it lists, whatever the product behind it can do.
    await panel
      .locator('li')
      .filter({ hasText: LID_FLAT })
      .getByRole('button', { name: 'Add to cart' })
      .click();
    await panel.getByRole('button', { name: 'Close' }).click();

    await page.goto('/cart');

    // The cart line says it too, and the same panel opens from there — the lid
    // is sold with the cup, which is the same edge read from the other end.
    await page.getByRole('button', { name: PANEL, exact: true }).click();
    await expect(
      page.getByRole('dialog').getByText('Takeaway Cup 300'),
    ).toBeVisible();
  });

  test('says nothing on a product sold alone', async ({ page }) => {
    await page.goto(`/product/${UNPAIRED}`);

    await expect(page.getByRole('button', { name: PANEL })).toHaveCount(0);
  });
});
