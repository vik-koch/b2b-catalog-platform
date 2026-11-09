import { expect, Page, test } from '@playwright/test';

import { localtestEnv } from '../support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/** Reading one account (FR-AUTH-03/04), `/admin/users/:id`, as a manager goes:
 * list name, account, editor button. Through the list's search, as phone
 * width shows cards, not a table. */
async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('the name in the account list opens the account, and it reads out', async ({
  page,
}) => {
  await logIn(page);
  await page.goto('/admin/users?searchTerm=s.moreau');

  // The one name the search leaves, as a link.
  const name = page.locator('a[href^="/admin/users/"]:not([href*="/edit"])');
  await expect(name).toHaveCount(1);
  await name.click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]+(\?|$)/);

  // The address is the first labelled line, and the account's own
  // facts are below it: what it is charged, and what an exchange knows it by.
  await expect(page.getByText('s.moreau@mail.example')).toBeVisible();
  await expect(page.getByText('Tier', { exact: true })).toBeVisible();
  await expect(page.getByText(/no automated update can reach/)).toBeVisible();

  // The page edits nothing; the only field is the shell's search box.
  await expect(page.locator('main input')).toHaveCount(0);

  // Nothing pushes the layout sideways, which matters on the phone.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the account leads on to the editor, and the editor comes back to it', async ({
  page,
}) => {
  await logIn(page);
  await page.goto('/admin/users?searchTerm=s.moreau');
  await page
    .locator('a[href^="/admin/users/"]:not([href*="/edit"])')
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]+(\?|$)/);
  const account = page.url();

  // A pending registration is a decision, so the button is the approval.
  await page.getByRole('link', { name: 'Review and approve' }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]+\/edit/);

  // Cancel puts the reader back where they were, not on the list.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(account);
});
