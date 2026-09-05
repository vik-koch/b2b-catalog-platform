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
/** `cart.pairing.*` in the demo text, with the counts filled in. On a short
 * line the offer and the shortfall are one sentence: `shortAction` is the link
 * that opens the panel, `shortReason` the plain text that follows it — so the
 * line's marker is named after what to add rather than after the panel. */
const SHORT_ACTION = /^Add \d+ /;
const SHORT = 'of what this is sold with';
const SUMMARY = 'products in your cart are missing what they are sold with';

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
    // Added from the panel, where the marker was pressed.
    await panel
      .locator('li')
      .filter({ hasText: LID_FLAT })
      .getByRole('button', { name: 'Add to cart' })
      .click();
    await panel.getByRole('button', { name: 'Close' }).click();
    // Gone before the next control is named, or the panel's own row still
    // answers to it.
    await expect(panel).toBeHidden();
    // And the cup itself, so the cart covers what it holds: a lid alone is
    // short of one, and a short line's marker is named after the shortfall
    // instead (the describe below). Without it this reads whichever name the
    // repricing round trip had not yet replaced.
    await page.getByRole('button', { name: 'Add to cart' }).click();

    await page.goto('/cart');

    // The cart line says it too, and the same panel opens from there — the lid
    // is sold with the cup, which is the same edge read from the other end.
    await page
      .locator('li')
      .filter({ hasText: LID_FLAT })
      .getByRole('button', { name: PANEL, exact: true })
      .click();
    await expect(
      page.getByRole('dialog').getByText('Takeaway Cup 300'),
    ).toBeVisible();
  });

  test('says nothing on a product sold alone', async ({ page }) => {
    await page.goto(`/product/${UNPAIRED}`);

    await expect(page.getByRole('button', { name: PANEL })).toHaveCount(0);
  });
});

/*
 * What the cart says about a pairing it cannot satisfy (FR-SET-02/03).
 *
 * The check runs on the server over the whole cart, so a real round trip is
 * what proves it: the line states how short it is, the card over the checkout
 * button counts the lines, and the link beside the sentence opens the products
 * that would answer it.
 *
 * Advisory here, which is the shipped default (FR-SET-04) — the enforced
 * variant is a deployment flag, and the disabled button it produces is the
 * cart page spec's.
 */
test.describe('a cart missing what it is sold with', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('cart'));
  });

  test('says how short each line is, and offers what would cover it', async ({
    page,
  }) => {
    // Both lids, no cup: each is sold with a cup that is not in the cart, so
    // each is short by its whole quantity.
    for (const slug of ['takeaway-lid-flat', 'takeaway-lid-domed']) {
      await page.goto(`/product/${slug}`);
      await page.getByRole('button', { name: 'Add to cart' }).click();
    }
    await page.goto('/cart');

    await expect(page.getByText(SHORT)).toHaveCount(2);
    // Counted once over the button it bears on, not per line.
    await expect(page.getByText(SUMMARY)).toBeVisible();
    // Advisory: the way out is still a link to the checkout.
    await expect(
      page.getByRole('link', { name: 'Proceed to checkout' }),
    ).toBeVisible();

    // And the way to answer it is the first half of that same sentence.
    await page.getByRole('button', { name: SHORT_ACTION }).first().click();
    await expect(
      page.getByRole('dialog').getByText('Takeaway Cup 300'),
    ).toBeVisible();
  });

  test('says nothing once the cart covers itself', async ({ page }) => {
    // The cup and one lid: the counterpart is in the cart, and one piece
    // covers one piece.
    for (const slug of [CUP, 'takeaway-lid-flat']) {
      await page.goto(`/product/${slug}`);
      await page.getByRole('button', { name: 'Add to cart' }).click();
    }
    await page.goto('/cart');

    await expect(page.getByText(SHORT)).toHaveCount(0);
    await expect(page.getByText(SUMMARY)).toHaveCount(0);

    // Take the lid out and the cup has nothing left to draw on — read from the
    // other end of the same edge.
    // The bin on a row removes it outright — what it took out is one line the
    // customer is looking at, so there is nothing to confirm.
    await page
      .locator('li')
      .filter({ hasText: LID_FLAT })
      .getByRole('button', { name: `Remove ${LID_FLAT}` })
      .click();

    await expect(page.getByText(SHORT)).toHaveCount(1);
  });
});
