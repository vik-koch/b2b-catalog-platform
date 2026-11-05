import { expect, Page, test } from '@playwright/test';
import { localtestEnv } from '../support/localtest';
import { fixtureSeed } from '../support/seed-fixture';

const DEMO_PASSWORD = fixtureSeed.accounts.password;

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];
/** A seeded, approved customer whose one order is complete and paid: nothing
 * waits on them. */
const SETTLED_CUSTOMER_EMAIL = 'anna.behrens@mail.example';
/** And one whose order was handed over on an invoice nobody has paid yet. */
const OWING_CUSTOMER_EMAIL = 'einkauf@cafe-nordlicht.example';

/*
 * Work awaiting attention (FR-WORK-01…04) in a browser: the marker, the panel's
 * counts, and each landing on the list it counted. Read-only, over seeded work.
 */

async function logIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** The account control, its name carrying the figure. Below `sm` there are two
 * (header and bottom bar), so callers take the first. */
const marked = (page: Page) =>
  page.getByRole('link', { name: /awaiting your attention/ });

test.describe('work awaiting attention', () => {
  test('marks the account control and says what is waiting on the panel', async ({
    page,
  }) => {
    await logIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin$/);

    // The dot itself shows no figure; the spoken label is where the total is.
    await expect(marked(page).first()).toBeAttached();

    // The seed leaves registrations waiting and order requests unanswered.
    const registrations = page.getByRole('link', {
      name: /awaiting approval/,
    });
    await expect(registrations).toHaveAttribute(
      'href',
      '/admin/users?status=pending',
    );
    await expect(
      page.getByRole('link', { name: /awaiting your answer/ }),
    ).toHaveAttribute('href', '/admin/orders?status=requested');

    // And one product held back from the storefront; the deleted one beside
    // it is out of the catalog, so it is not counted (FR-ADM-22).
    await expect(
      page.getByRole('link', { name: /awaiting publication/ }),
    ).toHaveAttribute('href', '/admin/products?state=unpublished');

    // Into the list, narrowed to exactly the rows behind the count.
    await registrations.click();
    await expect(page).toHaveURL(/\/admin\/users\?status=pending/);
    await expect(page.getByLabel('Filter by status')).toHaveValue('pending');
  });

  /** FR-WORK-04 from the customer's side: a complete, paid order waits on
   * nobody, so no marker, and no staff queue leaks. */
  test('leaves a settled customer’s account control unmarked', async ({
    page,
  }) => {
    await logIn(page, SETTLED_CUSTOMER_EMAIL, DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/account$/);

    await expect(marked(page)).toHaveCount(0);
  });

  /** And money due is work only the customer finishes, so it marks their
   * control, counted apart from an order to collect. */
  test('marks a customer who owes for an order', async ({ page }) => {
    await logIn(page, OWING_CUSTOMER_EMAIL, DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/account$/);

    await expect(marked(page).first()).toBeAttached();
    // Straight to the orders that owe money, not to the whole history: the
    // note names a job, so the link has to land on the list doing it.
    await expect(
      page.getByRole('link', { name: /waiting to be paid/ }),
    ).toHaveAttribute('href', '/account/orders?state=to-pay');
  });
});
