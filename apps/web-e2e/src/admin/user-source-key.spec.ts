import { expect, Page, test } from '@playwright/test';

import { localtestEnv } from '../support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/** The account editor's source key (FR-ADM-14), the way out beside a run's
 * claim (FR-ADM-17). Never saved: is it there, empty when unclaimed, explained
 * and usable on a phone. Who may write it is api-e2e's. */
async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** `s.moreau@mail.example` is seeded `pending` without a key, the claim's
 * deadlock. Through the list's search and its one edit link, as phone width
 * shows cards. */
async function openCustomer(page: Page): Promise<void> {
  await page.goto('/admin/users?searchTerm=s.moreau');
  const edit = page.locator('a[href*="/edit"]');
  await expect(edit).toHaveCount(1);
  await edit.click();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]+\/edit/);
}

test('an admin sees the source key, empty, on an account nobody has claimed', async ({
  page,
}) => {
  await logIn(page);
  await openCustomer(page);

  const field = page.getByLabel('Source key');
  await field.scrollIntoViewIfNeeded();
  await expect(field).toBeVisible();
  await expect(field).toHaveValue('');
  // The one field on this screen whose effect is on a system the person
  // reading it cannot see, so it has to say so.
  await expect(page.getByText(/no automated update can reach/)).toBeVisible();

  await field.fill('C-12345');
  await expect(field).toHaveValue('C-12345');

  // The field must not push the layout sideways, which matters on the phone.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
