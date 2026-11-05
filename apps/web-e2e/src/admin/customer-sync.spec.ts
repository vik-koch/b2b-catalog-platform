import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from '../support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/*
 * The manual customer import (FR-ADM-12). Never applied: that would create
 * accounts and mail people in a database other specs read. A preview writes
 * and sends nothing, and holds the UI worth testing; api-e2e covers writes.
 */

const R = Date.now().toString(36);

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Uploads an in-memory CSV: no fixture file to keep in step. */
async function upload(page: Page, csv: string): Promise<void> {
  await page.locator('input[type=file]').setInputFiles({
    name: 'customers.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByRole('button', { name: 'Preview changes' }).click();
}

test('the customer import is reached from the customer sync log', async ({
  page,
}) => {
  await logIn(page);
  await page.goto('/admin/sync/customers');

  await page.getByRole('link', { name: 'Manual sync' }).click();
  await expect(page).toHaveURL(/\/admin\/sync\/customers\/new$/);
  await expect(
    page.getByRole('heading', { name: 'Customer import' }),
  ).toBeVisible();
});

test('a file with a column nobody knows is refused, with nothing to apply', async ({
  page,
}) => {
  await logIn(page);
  await page.goto('/admin/sync/customers/new');

  await upload(page, 'sourceId,password\nC-1,hunter2\n');

  await expect(page.getByRole('alert')).toContainText('password');
  await expect(page.getByRole('button', { name: 'Apply' })).toBeHidden();
});

test('a preview says how many people it would email, and writes nothing', async ({
  page,
}) => {
  await logIn(page);
  await page.goto('/admin/sync/customers/new');

  await upload(
    page,
    'sourceId,email,access\n' +
      `e2e-web-${R}-1,e2e-web-${R}-1@example.test,enabled\n` +
      `e2e-web-${R}-2,e2e-web-${R}-2@example.test,enabled\n`,
  );

  // Two invitations and their mail count, which somebody will be asked about.
  // The count tiles, matched as tile terms: the preset descriptions above use
  // the same words in sentences, and each row's badge repeats its tile's word.
  // Whitespace allowed around the word: a regex is matched against the raw
  // text, which keeps the spaces of a template line the formatter wrapped.
  const tile = (name: string) =>
    page.getByRole('term').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) });
  await expect(tile('Invited')).toBeVisible();
  await expect(tile('Links sent')).toBeVisible();
  await expect(
    page.getByRole('link', { name: `e2e-web-${R}-1@example.test` }),
  ).toBeVisible();
  // Staged, not applied: the button is still there to press.
  await expect(page.getByRole('button', { name: 'Apply' })).toBeEnabled();
});

test('the price-list preset asks for no invitations at all', async ({
  page,
}) => {
  await logIn(page);
  await page.goto('/admin/sync/customers/new');

  // Clicked on the card's own hit area rather than `.check()`ed on the input:
  // the choice card's overlay is what a hand hits, and it intercepts a click on
  // the radio.
  await page
    .locator('ui-choice-card')
    .filter({ hasText: 'Price list update' })
    .locator('label')
    .click();
  await expect(
    page.getByRole('radio', { name: /Price list update/ }),
  ).toBeChecked();
  await upload(page, `sourceId,tierKey\ne2e-web-${R}-3,nope\n`);

  // Nobody is created, so an unknown customer is a skipped row, and the run
  // does nothing.
  await expect(page.getByText('Skipped', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply' })).toBeHidden();
});

/** Claiming a shop-registered account (FR-ADM-17), preview only: the operator
 * is told before pressing anything. `s.moreau@mail.example` is seeded
 * `pending` without a key: the deadlock claims are for. */
const UNCLAIMED = 's.moreau@mail.example';

test('a row matching an account nobody claimed says so, rather than “address taken”', async ({
  page,
}) => {
  await logIn(page);
  await page.goto('/admin/sync/customers/new');

  await upload(
    page,
    `sourceId,email,access\ne2e-web-${R}-9,${UNCLAIMED},enabled\n`,
  );

  // Matched on wording only the row error has: the checkbox that would fix it
  // is on the same screen, and says almost the same thing.
  await expect(page.getByText(/carries no source key yet/)).toBeVisible();
  await expect(page.getByText('Claimed', { exact: true })).toBeHidden();
});

test('claiming is opted into, and the preview warns before anything is applied', async ({
  page,
}) => {
  await logIn(page);
  await page.goto('/admin/sync/customers/new');

  await page.getByText('Advanced').click();
  await page
    .getByRole('checkbox', { name: /Claim accounts by email address/ })
    .check();

  await upload(
    page,
    `sourceId,email,access\ne2e-web-${R}-9,${UNCLAIMED},enabled\n`,
  );

  // The count tile, the row badge and the warning: each place a reader could
  // notice it.
  await expect(
    page.getByText('Claimed', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('this run will claim');
  await expect(page.getByRole('button', { name: 'Apply' })).toBeEnabled();
});
