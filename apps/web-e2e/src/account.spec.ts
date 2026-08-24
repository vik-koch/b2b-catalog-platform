import { hash } from '@node-rs/argon2';
import { expect, Page, test, TestInfo } from '@playwright/test';
import { localtestDbClient } from './support/localtest';

/**
 * The customer's own area: greeted by name, and shown what the shop holds on
 * their account. The details come from `/account/profile` rather than from the
 * session, so this is also what proves the endpoint is reachable by the role
 * that actually uses it.
 */

const PASSWORD = 'e2e-account-password';

// A phone number is stored unmasked — country code plus bare national digits —
// and grouped by the deployment's mask only when it is read back. Seeding the
// stored form and asserting the displayed one is what proves the pair agree.
const DETAILS = {
  firstName: 'Alex',
  lastName: 'Fischer',
  phone: '+494012345678',
  phoneDisplayed: '+49 (401) 234-5678',
};

// Per worker, not per project: the suite is fully parallel, so an address
// shared between workers has one of them deleting the row another just made.
const emailFor = ({ project, workerIndex }: TestInfo) =>
  `e2e-${project.name}-${workerIndex}-account@example.com`;

/**
 * Every account a test makes, torn down even when it fails. By **id**, not by
 * address: a deleted account keeps its row under a tombstoned address, so an
 * address is not a handle that survives what these tests do. Per worker, since
 * each Playwright worker is its own process.
 */
const created: string[] = [];

async function arrange(
  testInfo: TestInfo,
  /** A company account, registered under the deployment's second format. */
  companyRegistrationId?: string,
): Promise<string> {
  const email = emailFor(testInfo);
  const client = localtestDbClient();
  await client.connect();
  try {
    await client.query('DELETE FROM users WHERE email = $1', [email]);
    // `status` must be named: it defaults to `pending`, which cannot log in.
    const { rows } = await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName", phone, "customerType", "companyRegistrationId")
       VALUES ($1, $2, 'user', 'active', $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        email,
        await hash(PASSWORD),
        DETAILS.firstName,
        DETAILS.lastName,
        DETAILS.phone,
        companyRegistrationId ? 'company' : 'person',
        companyRegistrationId ?? null,
      ],
    );
    created.push(rows[0].id);
  } finally {
    await client.end();
  }
  return email;
}

async function logIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test.describe('my account', () => {
  test.afterEach(async () => {
    if (created.length === 0) return;
    const client = localtestDbClient();
    await client.connect();
    try {
      await client.query('DELETE FROM users WHERE id = ANY($1)', [created]);
    } finally {
      await client.end();
      created.length = 0;
    }
  });

  test('greets the customer by name and shows their details', async ({
    page,
  }, testInfo) => {
    const email = await arrange(testInfo);

    await logIn(page, email);
    await expect(page).toHaveURL(/\/account$/);

    await expect(page.getByText(`Hello, ${DETAILS.firstName}`)).toBeVisible();

    // The details themselves, read off the description list rather than the
    // page: the address also identifies the session in the greeting block, and
    // this assertion is about the record.
    const details = page.getByRole('definition');
    await expect(details.getByText(email)).toBeVisible();
    await expect(
      details.getByText(`${DETAILS.firstName} ${DETAILS.lastName}`),
    ).toBeVisible();
    await expect(details.getByText(DETAILS.phoneDisplayed)).toBeVisible();
    await expect(details.getByText('Private person')).toBeVisible();

    // The pricing tier is staff's to know: no label of any kind for it.
    await expect(page.getByText('Tier')).toHaveCount(0);
  });

  test('reaches the change-password page from the account', async ({
    page,
  }, testInfo) => {
    const email = await arrange(testInfo);

    await logIn(page, email);
    await page.getByRole('link', { name: 'Change password' }).click();

    await expect(page).toHaveURL(/\/change-password$/);
  });

  test('edits the name, and the greeting follows it', async ({
    page,
  }, testInfo) => {
    const email = await arrange(testInfo);

    await logIn(page, email);
    await page.getByRole('link', { name: 'Edit details' }).click();
    await expect(page).toHaveURL(/\/account\/edit$/);

    await page.getByLabel('First name').fill('Alexa');
    await page.getByRole('button', { name: 'Save changes' }).click();

    // Straight back to the record — the new values are the confirmation, so
    // there is no notice to dismiss.
    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByRole('definition').getByText('Alexa Fischer'),
    ).toBeVisible();
    // The greeting is built from the session, not from the save's response, so
    // it only follows the new name if /auth/me was re-asked.
    await expect(page.getByText('Hello, Alexa')).toBeVisible();
  });

  // The address book (FR-CART-04), through the browser: saved, listed, gone.
  test('saves an address, lists it, and removes it again', async ({
    page,
  }, testInfo) => {
    const email = await arrange(testInfo);

    await logIn(page, email);
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText('No saved addresses yet')).toBeVisible();

    await page.getByRole('link', { name: 'Add address' }).click();
    await expect(page).toHaveURL(/\/account\/addresses\/new$/);

    // Nothing is typed into the name: it is optional, and the row is then
    // headed by its own street line.
    await page.getByLabel('Street and number').fill('Hafenstraße 12');
    await page.getByLabel('Postcode').fill('20359');
    await page.getByLabel('City').fill('Hamburg');
    await page.getByRole('button', { name: 'Save address' }).click();

    // Back to the book, which shows what was saved.
    await expect(page).toHaveURL(/\/account$/);
    await expect(
      page.getByText('Hafenstraße 12', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('20359 Hamburg')).toBeVisible();

    // Removing is confirmed first — the only destructive thing on the card.
    await page.getByRole('button', { name: 'Remove' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove address' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove' }).click();

    await expect(page.getByText('No saved addresses yet')).toBeVisible();
  });

  /**
   * The deployment takes two shapes of registration number, and this account is
   * registered under the second. The address form must open on *that* shape:
   * dressed in the first, a ten-digit number is masked into a five-digit box,
   * and the save would store what is left.
   */
  test('opens the address form on the shape the account’s number is in', async ({
    page,
  }, testInfo) => {
    const email = await arrange(testInfo, '1234567890');

    await logIn(page, email);
    // Through the page, not a cold `goto`: a guarded route loaded directly
    // races the session the login just established.
    await expect(page).toHaveURL(/\/account$/);
    await page.getByRole('link', { name: 'Add address' }).click();

    const number = page.getByLabel('Company registration number');
    await expect(number).toHaveValue('1234567890');
    await expect(page.getByLabel('Kind of registration number')).toHaveValue(
      'tax',
    );

    // Switching the kind asks for the number again rather than keeping a
    // prefix of one that belonged to another shape.
    await page.getByLabel('Kind of registration number').selectOption('vat');
    await expect(number).toHaveValue('');
  });

  test('deletes the account, and the address can be registered again', async ({
    page,
  }, testInfo) => {
    const email = await arrange(testInfo);

    await logIn(page, email);
    await expect(page).toHaveURL(/\/account$/);
    await page.getByRole('link', { name: 'Delete my account' }).click();

    // The consequences are on the page before anything is typed.
    await expect(
      page.getByText('your earlier orders will not appear in it'),
    ).toBeVisible();

    await page.getByLabel('Your password').fill('not-my-password');
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByRole('alert')).toContainText('not your password');

    await page.getByLabel('Your password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await expect(
      page.getByRole('heading', { name: 'Your account has been deleted' }),
    ).toBeVisible();

    // Signed out for real: the navbar's account link points at /login again,
    // and the old credentials no longer work.
    await expect(page.getByRole('link', { name: 'Account' })).toHaveAttribute(
      'href',
      '/login',
    );
    await logIn(page, email);
    await expect(page.getByRole('alert')).toHaveText(
      'Invalid email or password.',
    );

    // The tombstone gave the address up: the row that held it is gone from
    // under it, and a new registration is a new account.
    const client = localtestDbClient();
    await client.connect();
    try {
      const { rows } = await client.query(
        'SELECT status FROM users WHERE email = $1',
        [email],
      );
      expect(rows).toHaveLength(0);
    } finally {
      await client.end();
    }
  });

  // What staff approved the account on is not the account holder's to change.
  test('offers no way to change the account type or address', async ({
    page,
  }, testInfo) => {
    const email = await arrange(testInfo);

    await logIn(page, email);
    // The landing first: a `goto` issued while the login is still in flight
    // races the session, and the guard bounces the cold load to /login.
    await expect(page).toHaveURL(/\/account$/);
    await page.goto('/account/edit');

    await expect(page.getByLabel('First name')).toBeVisible();
    await expect(page.getByLabel('Account type')).toHaveCount(0);
    await expect(page.getByLabel('Email')).toHaveCount(0);
  });
});
