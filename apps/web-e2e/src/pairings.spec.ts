import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/*
 * Sold-together pairings in the product editor (FR-SET-01).
 *
 * What is left for a real browser is the picker: a search that asks the catalog
 * as it is typed, a panel that can be picked from, and a box that is already
 * open where the product has counterparts. The mutuality and the refusals are
 * api-e2e's; the filtering rules are the component spec's.
 *
 * Read-only — the editor is opened and left without saving, as
 * catalog-editing.spec does.
 */

/** The seeded pair: a takeaway cup and the two lids that fit it. */
const CUP = 'takeaway-cup-300';
const LID_FLAT = 'Takeaway Lid, Flat (50)';
const LID_DOMED = 'Takeaway Lid, Domed (50)';
/** A product nothing is paired with. */
const UNPAIRED = 'latte-glass-set';

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
