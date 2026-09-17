import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/**
 * The source key on the account editor (FR-ADM-14) — the manual way to give a
 * self-registered account the key an exchange addresses it by, and the escape
 * hatch behind the run-level claim (FR-ADM-17).
 *
 * Read-only: the field is filled and the form is never saved, because these
 * accounts are seeded state the other specs assert on. What the browser is
 * asked is whether the field is there, is empty on an account nobody has
 * claimed, says what it is for, and is usable on a phone. Who may *write* it
 * is api-e2e's question.
 */
async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/**
 * `s.moreau@mail.example` is seeded `pending` with no source key — the
 * deadlock the claim exists for, in the one state where nobody on either side
 * can decide about them.
 *
 * Reached through the list's own search and the single edit link that search
 * leaves behind, rather than through a row element: this spec runs at phone
 * width too, where the admin grid is a list of cards and there is no table.
 */
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

  // Nothing the field adds may push the layout sideways — the check that
  // matters on the phone project.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
