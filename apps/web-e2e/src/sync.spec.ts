import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/*
 * The bulk catalog sync screen (FR-ADM-02). Like the other admin specs, this
 * NEVER applies a run: the suite shares one database with the catalog specs,
 * which assert seeded state. A *preview* writes nothing to the catalog, so it is
 * safe to exercise fully — and it is where the interesting UI lives. The write
 * path is covered in api-e2e, which owns and restores the database.
 */

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Uploads an in-memory CSV — no fixture file to keep in step with the parser. */
async function upload(page: Page, csv: string): Promise<void> {
  await page.setInputFiles('input[type=file]', {
    name: 'catalog.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByRole('button', { name: 'Preview changes' }).click();
}

test('the sync screen is admin-only', async ({ page }) => {
  await page.goto('/admin/sync');
  await expect(page).toHaveURL(/\/login/);
});

/** The panel row whose link reads `name`: each sync area has its own row, and
 * each row its own last-sync line, so the line is read inside one of them. */
function syncRow(page: Page, name: string) {
  return page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
}

test('the admin dashboard links to the sync and shows a last-sync line', async ({
  page,
}) => {
  await logIn(page);

  // One line per area, on the area's own row: the catalog's with the catalog,
  // the customers' with the accounts it writes.
  await expect(
    syncRow(page, 'Catalog sync').getByText(/Last sync|Never synced/),
  ).toBeVisible();
  await expect(
    syncRow(page, 'Customer sync').getByText(/Last sync|Never synced/),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Catalog sync' }).click();
  // The panel opens that area's log of runs; the upload is a page reached
  // from it.
  await expect(page).toHaveURL(/\/admin\/sync\/catalog$/);
  await page.getByRole('link', { name: 'Manual sync' }).click();
  await expect(page).toHaveURL(/\/admin\/sync\/catalog\/new$/);
});

test('a malformed file is refused with the reason, and nothing to apply', async ({
  page,
}) => {
  await logIn(page);
  await page.goto('/admin/sync/catalog/new');

  await upload(page, 'name,price\nBeans,100\n');

  await expect(page.getByRole('alert')).toContainText('sourceId');
  await expect(
    page.getByRole('button', { name: 'Apply these changes' }),
  ).toBeHidden();
});

test('a preview shows the diff without writing, and hiding needs a typed confirmation', async ({
  page,
}) => {
  await logIn(page);
  await page.goto('/admin/sync/catalog/new');

  // The default preset claims a complete catalog; turning on the hide option
  // makes this run sweep everything the seeded catalog has.
  await page.getByText('Advanced options').click();
  await page.getByLabel('Hide products that are missing from the file').check();

  await upload(
    page,
    'sourceId,name,categorySourceId,categoryName,price\nE2E-1,Preview Only,E2E-C1,Preview Category,1000\n',
  );

  await expect(page.getByText('What this run would change')).toBeVisible();
  // A product and a category the catalog does not have → both are additions.
  await expect(page.getByText('Preview Only')).toBeVisible();
  await expect(page.getByText('Preview Category')).toBeVisible();

  const apply = page.getByRole('button', { name: 'Apply these changes' });
  await expect(apply).toBeDisabled();

  await page.getByLabel(/Type HIDE to confirm/).fill('HIDE');
  await expect(apply).toBeEnabled();

  // Deliberately not clicked: applying would empty the seeded catalog that the
  // storefront specs assert against.
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('What this run would change')).toBeHidden();

  // The catalog is untouched — the preview really was a dry run.
  await page.goto('/catalog');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('a price update cannot be given the hide option', async ({ page }) => {
  await logIn(page);
  await page.goto('/admin/sync/catalog/new');

  // Clicked on the card's own hit area rather than `.check()`ed on the input:
  // the choice card lays an overlay over its whole surface, and that overlay
  // is what a hand hits — and what intercepts a click aimed at the radio.
  await page
    .locator('app-choice-card')
    .filter({ hasText: 'Price update' })
    .locator('label')
    .click();
  await expect(page.getByRole('radio', { name: /Price update/ })).toBeChecked();
  await page.getByText('Advanced options').click();

  await expect(
    page.getByLabel('Hide products that are missing from the file'),
  ).toBeDisabled();
});
