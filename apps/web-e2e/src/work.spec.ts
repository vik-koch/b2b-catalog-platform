import { expect, Page, test } from '@playwright/test';
import { DEMO_PASSWORD } from '@b2b-catalog-platform/seed';
import { localtestEnv } from './support/localtest';

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];
/** A seeded, approved customer — nothing waits on them (see below). */
const CUSTOMER_EMAIL = 'anna.behrens@mail.example';

/*
 * Work awaiting attention (FR-WORK-01…04) in a real browser: the marker on the
 * account control, the counts on the panel, and the fact that each one lands
 * on the list narrowed to the rows it counted.
 *
 * Read-only. The counts are queries over seeded state — pending registrations
 * and unanswered order requests — so nothing here has to create work to have
 * some, and nothing it does changes what another spec asserts.
 */

async function logIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

/** The account control, whose accessible name carries the marker's figure.
 * Two of them below the `sm` breakpoint — the header's and the bottom bar's —
 * so callers take the first and count rather than assert visibility. */
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

    // Every seeded product is on the storefront, so that queue is empty — and
    // an empty queue says nothing at all rather than showing a zero.
    await expect(
      page.getByRole('link', { name: /awaiting publication/ }),
    ).toHaveCount(0);

    // Into the list, narrowed to exactly the rows behind the count.
    await registrations.click();
    await expect(page).toHaveURL(/\/admin\/users\?status=pending/);
    await expect(page.getByLabel('Filter by status')).toHaveValue('pending');
  });

  /**
   * FR-WORK-04 from the other side. A customer is shown only what waits on
   * them in their own orders, and nothing does yet: the states that wait on a
   * customer arrive with order processing. So the control stays unmarked —
   * which is also the check that the staff queues are never leaked to them.
   */
  test('leaves a customer’s account control unmarked', async ({ page }) => {
    await logIn(page, CUSTOMER_EMAIL, DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/account$/);

    await expect(marked(page)).toHaveCount(0);
  });
});
