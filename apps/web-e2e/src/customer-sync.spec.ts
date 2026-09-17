import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/*
 * The manual customer import (FR-ADM-12). Like the catalog's screen next door,
 * this spec NEVER applies a run: applying would create accounts and email the
 * people named in the file, in a database the other specs assert seeded state
 * in. A *preview* writes no account and sends no mail, so it is safe to
 * exercise fully — and it is where the interesting UI is. The write path is
 * covered in api-e2e, which owns and restores its database.
 */

const R = Date.now().toString(36);

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

  // Two invitations, and the mail count that goes with them — the figure
  // somebody is about to be asked about.
  // The count tiles, matched exactly: the preset descriptions above use the
  // same words in sentences.
  await expect(page.getByText('Invited', { exact: true })).toBeVisible();
  await expect(page.getByText('Links sent', { exact: true })).toBeVisible();
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
  // the choice card lays an overlay over its whole surface, and that overlay is
  // what a hand hits — and what intercepts a click aimed at the radio.
  await page
    .locator('app-choice-card')
    .filter({ hasText: 'Price list update' })
    .locator('label')
    .click();
  await expect(
    page.getByRole('radio', { name: /Price list update/ }),
  ).toBeChecked();
  await upload(page, `sourceId,tierKey\ne2e-web-${R}-3,nope\n`);

  // Nobody is created, so an unknown customer is simply a skipped row — and
  // the run is one that would do nothing.
  await expect(page.getByText('Skipped', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply' })).toBeHidden();
});

/**
 * Claiming an account somebody registered on the shop (FR-ADM-17). Preview
 * only, like everything else here: a claim is a write to a seeded account, and
 * what is worth seeing on this screen is that the operator is told what is
 * about to happen before they can press anything.
 *
 * `s.moreau@mail.example` is seeded `pending` with no source key — the
 * deadlock the claim exists for, in the one state where nobody on either side
 * can decide about them.
 */
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

  // The count tile, the row badge and the warning above the button — the three
  // places a reader could notice it, and the reason none of them is optional.
  await expect(
    page.getByText('Claimed', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText('will be claimed');
  await expect(page.getByRole('button', { name: 'Apply' })).toBeEnabled();
});
