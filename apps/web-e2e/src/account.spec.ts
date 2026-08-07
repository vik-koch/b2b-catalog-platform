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

const DETAILS = {
  firstName: 'Alex',
  lastName: 'Fischer',
  phone: '+49 40 1234567',
};

// Per worker, not per project: the suite is fully parallel, so an address
// shared between workers has one of them deleting the row another just made.
const emailFor = ({ project, workerIndex }: TestInfo) =>
  `e2e-${project.name}-${workerIndex}-account@example.com`;

async function arrange(testInfo: TestInfo): Promise<string> {
  const email = emailFor(testInfo);
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
  test.afterEach(async (_fixtures, testInfo) => {
    const client = localtestDbClient();
    await client.connect();
    try {
      await client.query('DELETE FROM users WHERE email = $1', [
        emailFor(testInfo),
      ]);
    } finally {
      await client.end();
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
});
