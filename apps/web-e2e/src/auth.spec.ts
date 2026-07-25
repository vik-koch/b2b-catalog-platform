import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from './support/localtest';

// The bootstrap-admin one-shot creates this account on `up`, from
// the same values compose interpolates — so the spec can't drift from the stack.
const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

// The navbar account control is a plain link in both states; its label is the
// visible text on desktop and screen-reader-only on mobile, so the accessible
// name works either way.
const accountLink = (page: Page, label: string) =>
  page.getByRole('link', { name: label, exact: true });

// /login is client-rendered, so the form only exists once Angular has built it
// — Playwright's auto-waiting covers that, and there is no server-rendered DOM
// for a client-side rebind to type over.
async function logIn(page: Page, password = ADMIN_PASSWORD): Promise<void> {
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test('the navbar account icon takes a signed-out visitor to the login page', async ({
  page,
}) => {
  await page.goto('/');

  await accountLink(page, 'Account').click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('h1')).toHaveText('Log in');
});

test('signs the bootstrap admin in and lands them in the admin panel', async ({
  page,
}) => {
  await page.goto('/login');
  await logIn(page);

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('h1')).toHaveText('Admin panel');

  // The panel itself carries the identity and the way out; the navbar icon has
  // simply become a link pointing here.
  await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
  await expect(accountLink(page, 'Account')).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL('/');
  await expect(accountLink(page, 'Account')).toBeAttached();
});

test('rejects wrong credentials without leaving the login page', async ({
  page,
}) => {
  await page.goto('/login');
  await logIn(page, 'definitely-not-the-password');

  await expect(page.getByRole('alert')).toHaveText(
    'Invalid email or password.',
  );
  await expect(page).toHaveURL(/\/login$/);
});

test('bounces a signed-out visitor off /admin and back after logging in', async ({
  page,
}) => {
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fadmin$/);

  await logIn(page);

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('h1')).toHaveText('Admin panel');
});

test('keeps the session across a full page load', async ({ page }) => {
  await page.goto('/login');
  await logIn(page);
  await expect(page).toHaveURL(/\/admin$/);

  // The cookie is httpOnly, so this proves the browser sends it and /auth/me
  // rebuilds the session — not that anything was stashed in page JavaScript.
  await page.reload();

  await expect(page.locator('h1')).toHaveText('Admin panel');
  await expect(accountLink(page, 'Account')).toBeAttached();
});
