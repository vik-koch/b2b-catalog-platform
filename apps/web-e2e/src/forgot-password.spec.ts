import { hash } from '@node-rs/argon2';
import { expect, test, TestInfo } from '@playwright/test';
import { localtestDbClient, MAILPIT_API } from './support/localtest';

/**
 * FR-AUTH-02 through the whole path a locked-out customer actually walks:
 * login page → ask for a link → read the mail → choose a new password → signed
 * in. The mail is caught from the real sink, so the link under test is the one
 * a recipient would click.
 */

const OLD_PASSWORD = 'e2e-forgot-old-password';
const NEW_PASSWORD = 'e2e-forgot-new-password';

// Per worker, not per project: the suite is fully parallel, so an address
// shared between workers has one of them resetting what another just seeded.
const emailFor = ({ project, workerIndex }: TestInfo) =>
  `e2e-${project.name}-${workerIndex}-forgot@example.com`;

const created: string[] = [];

async function arrange(testInfo: TestInfo): Promise<string> {
  const email = emailFor(testInfo);
  const client = localtestDbClient();
  await client.connect();
  try {
    await client.query('DELETE FROM users WHERE email = $1', [email]);
    // `status` must be named: it defaults to `pending`, which cannot log in.
    const { rows } = await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName")
       VALUES ($1, $2, 'user', 'active', 'Alex', 'Fischer') RETURNING id`,
      [email, await hash(OLD_PASSWORD)],
    );
    created.push(rows[0].id);
  } finally {
    await client.end();
  }
  return email;
}

test.describe('forgotten password', () => {
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

  test('asks for a link, and the link sets a new password', async ({
    page,
    request,
  }, testInfo) => {
    const email = await arrange(testInfo);

    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);

    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Send me a link' }).click();
    await expect(
      page.getByRole('heading', { name: 'Check your email' }),
    ).toBeVisible();

    // The sink is shared with the other project running this spec, so search
    // for this worker's own address rather than clearing and counting.
    let link = '';
    await expect
      .poll(async () => {
        const res = await request.get(`${MAILPIT_API}/search`, {
          params: { query: email },
        });
        const { messages } = (await res.json()) as {
          messages: { ID: string }[];
        };
        if (messages.length === 0) return '';
        const body = await request.get(
          `${MAILPIT_API}/message/${messages[0].ID}`,
        );
        const { HTML } = (await body.json()) as { HTML: string };
        link = /\/set-password\?token=[\w-]+/.exec(HTML)?.[0] ?? '';
        return link;
      })
      .not.toBe('');

    await page.goto(link);
    // Reset wording, not the invitation's: this account already had a password.
    await expect(
      page.getByRole('heading', { name: 'Choose a new password' }),
    ).toBeVisible();

    await page.getByLabel('Password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Repeat password').fill(NEW_PASSWORD);
    await page
      .getByRole('button', { name: 'Save password and continue' })
      .click();

    // Redeeming signs them in, so they land on their own account area.
    await expect(page.getByText('Hello, Alex')).toBeVisible();
  });

  // The form must not become a way to test which addresses are customers.
  test('answers the same for an address with no account', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.getByLabel('Email').fill('e2e-nobody-at-all@example.com');
    await page.getByRole('button', { name: 'Send me a link' }).click();

    await expect(
      page.getByRole('heading', { name: 'Check your email' }),
    ).toBeVisible();
  });
});
