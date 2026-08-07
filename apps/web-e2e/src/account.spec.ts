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

// The phone number is stored the way the form composes it: the deployment's
// country code, then the national part grouped by its mask. A number that
// predates the mask still displays, but cannot be re-saved without retyping.
const DETAILS = {
  firstName: 'Alex',
  lastName: 'Fischer',
  phone: '+49 (401) 234-5678',
};

// Per worker, not per project: the suite is fully parallel, so an address
// shared between workers has one of them deleting the row another just made.
const emailFor = ({ project, workerIndex }: TestInfo) =>
  `e2e-${project.name}-${workerIndex}-account@example.com`;

/** Every account a test makes, torn down even when it fails. Per worker, since
 * each Playwright worker is its own process. */
const created: string[] = [];

async function arrange(testInfo: TestInfo): Promise<string> {
  const email = emailFor(testInfo);
  created.push(email);
  const client = localtestDbClient();
  await client.connect();
  try {
    await client.query('DELETE FROM users WHERE email = $1', [email]);
    // `status` must be named: it defaults to `pending`, which cannot log in.
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName", phone, "customerType")
       VALUES ($1, $2, 'user', 'active', $3, $4, $5, 'person')`,
      [
        email,
        await hash(PASSWORD),
        DETAILS.firstName,
        DETAILS.lastName,
        DETAILS.phone,
      ],
    );
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
      await client.query('DELETE FROM users WHERE email = ANY($1)', [created]);
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
    await expect(details.getByText(DETAILS.phone)).toBeVisible();
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
