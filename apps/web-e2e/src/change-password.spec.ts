import { hash } from '@node-rs/argon2';
import { expect, Page, test } from '@playwright/test';
import { localtestDbClient } from './support/localtest';

/**
 * These specs need an account that owns its own password and can have it
 * rewritten, so they create one per Playwright project instead of borrowing the
 * bootstrap admin: the projects (desktop, mobile) run concurrently, and two
 * workers changing one account's password would race.
 */
const accountFor = (project: string) => ({
  email: `e2e-${project}-change-password@example.com`,
  password: 'e2e-original-password',
});

const NEW_PASSWORD = 'e2e-chosen-password';

async function createAccount(
  email: string,
  password: string,
  mustChangePassword: boolean,
  created: string[],
): Promise<void> {
  created.push(email);
  const client = localtestDbClient();
  await client.connect();
  try {
    await client.query('DELETE FROM users WHERE email = $1', [email]);
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, "mustChangePassword")
       VALUES ($1, $2, 'admin', $3)`,
      [email, await hash(password), mustChangePassword],
    );
  } finally {
    await client.end();
  }
}

async function logIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test.describe('changing your own password', () => {
  // Every account these specs make is torn down even when the spec fails, so a
  // red run leaves no rows behind to confuse the next one.
  const created: string[] = [];

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

  test('changes it from its own page and invalidates the old one', async ({
    page,
  }, testInfo) => {
    const { email, password } = accountFor(testInfo.project.name);
    await createAccount(email, password, false, created);

    await logIn(page, email, password);
    await expect(page).toHaveURL(/\/admin$/);

    // Reached the way a user reaches it: the link on the landing page.
    await page.getByRole('link', { name: 'Change password' }).click();
    await expect(page).toHaveURL(/\/change-password$/);

    await page.getByLabel('Current password').fill(password);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Change password' }).click();

    await expect(page.getByRole('status')).toContainText(
      'Your password has been changed',
    );

    // The session survives its own password change (the server re-issues the
    // cookie), so we stay put rather than being bounced to /login.
    await expect(page).toHaveURL(/\/change-password$/);

    // The old password is genuinely gone, the new one works.
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Log out' }).click();
    await logIn(page, email, password);
    await expect(page.getByRole('alert')).toHaveText(
      'Invalid email or password.',
    );
    await logIn(page, email, NEW_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('is forced on an account still using the password it was given', async ({
    page,
  }, testInfo) => {
    const { email, password } = accountFor(`${testInfo.project.name}-forced`);
    await createAccount(email, password, true, created);

    await logIn(page, email, password);

    // The modal is in the way from the moment the session resolves — and being a
    // real <dialog> in modal mode, Escape does not dismiss it.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Current password').fill(password);
    await dialog.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await dialog.getByLabel('Confirm new password').fill(NEW_PASSWORD);
    await dialog.getByRole('button', { name: 'Change password' }).click();

    await expect(dialog.getByRole('status')).toContainText(
      'Your password has been changed',
    );
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog).toBeHidden();

    // Gone for good, not just for this page: the flag cleared server-side.
    await page.reload();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('offers logging out to someone who cannot produce the current password', async ({
    page,
  }, testInfo) => {
    const { email, password } = accountFor(`${testInfo.project.name}-escape`);
    await createAccount(email, password, true, created);

    await logIn(page, email, password);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Log out' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});
