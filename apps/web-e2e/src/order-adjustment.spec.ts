import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localtestEnv, workspaceRoot } from './support/localtest';

/**
 * The wording is read from the deployment's own text rather than repeated
 * here. These labels are short and get reworded — twice already — and a spec
 * that hardcodes them fails the next time somebody shortens a button rather
 * than the next time the button stops working.
 */
const adminText = JSON.parse(
  readFileSync(join(workspaceRoot, 'config/admin-text.json'), 'utf8'),
) as {
  orderDetail: {
    actions: { adjust: string };
    revisions: { heading: string; changes: string; openControls: string };
    tellCustomer: { action: string };
  };
  orderAdjust: {
    save: string;
    confirm: string;
    note: string;
    lines: { units: string };
    changes: { none: string; total: string };
  };
};
const detail = adminText.orderDetail;
const adjust = adminText.orderAdjust;

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/**
 * Adjusting an order (FR-ORD-03) in a real browser: the form seeded from the
 * order, the change list that says what a manager is about to tell the
 * customer, and the version history left behind afterwards.
 *
 * It works on the one seeded order that already carries a change — a guest's,
 * so no account's own queue counts it and no other spec asserts anything about
 * it. Changing it again leaves it exactly where it stands, with one more
 * version behind it.
 */
const REFERENCE = 'CK-260901-5528';

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('adjusting an order', () => {
  test('reads the versions an order already has', async ({ page }) => {
    await logIn(page);
    await page.goto(`/admin/orders/${REFERENCE}`);

    // The lid of the versions panel, which is labelled for what it opens
    // rather than for the row it sits in.
    await page
      .getByRole('button', { name: RegExp(detail.revisions.subheading) })
      .click();

    // What the shop said it changed, and — once unfolded — the difference it
    // made. The differences are worked out only for the version opened, so
    // this is also the assertion that the fold does that work.
    await expect(page.getByText(/Only 12 of the espresso left/)).toBeVisible();
    await page
      .getByRole('button', { name: detail.revisions.changes })
      .first()
      .click();
    await expect(page.getByText(adjust.changes.total).first()).toBeVisible();
  });

  /**
   * Reading a version and answering the order are two screens (ADR 0051). The
   * list's title opens the first; everything a manager does lives on the
   * second, and the read-only page's only control is the way there.
   */
  test('opens a version from the list, and the order from the version', async ({
    page,
  }) => {
    await logIn(page);
    await page.goto(`/admin/orders?q=${REFERENCE}`);

    await page.getByRole('link', { name: REFERENCE }).first().click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/orders/${REFERENCE}/revisions/\\d+$`),
    );
    // The customer's own reading of the order, with what only the shop knows
    // beside it.
    await expect(page.getByText(detail.revisions.heading)).toBeVisible();

    await page
      .getByRole('link', { name: detail.revisions.openControls })
      .click();
    await expect(page).toHaveURL(new RegExp(`/admin/orders/${REFERENCE}$`));
    await expect(
      page.getByRole('link', { name: detail.actions.adjust, exact: true }),
    ).toBeVisible();
  });

  // On a phone as well as on a desktop: the form is a manager's daily work and
  // a good deal of it happens standing in a warehouse.
  test('says what a change comes to before anything is written', async ({
    page,
  }) => {
    await logIn(page);
    await page.goto(`/admin/orders/${REFERENCE}`);
    await page
      .getByRole('link', { name: detail.actions.adjust, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${REFERENCE}/adjust$`));

    // Seeded from the order: nothing has changed, and the list says so.
    await expect(page.getByText(adjust.changes.none)).toBeVisible();

    const quantity = page.getByLabel(adjust.lines.units).first();
    await quantity.fill(String(Number(await quantity.inputValue()) + 1));

    // The server prices the draft; what the change list shows is its answer,
    // and nothing on the page works the total out for itself.
    await expect(page.getByText(adjust.changes.total)).toBeVisible();
    // Whatever the width, the page itself never scrolls sideways.
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  // One browser only: both projects share a database, and two managers
  // adjusting one order is exactly the race the endpoint refuses — which is
  // correct behaviour and a flaky test.
  test('writes a new version and tells the manager what it says', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'the write is asserted once, on one browser');
    await logIn(page);
    await page.goto(`/admin/orders/${REFERENCE}/adjust`);

    const quantity = page.getByLabel(adjust.lines.units).first();
    await quantity.fill(String(Number(await quantity.inputValue()) + 1));
    await page.getByLabel(adjust.note).fill('One more pack, as agreed.');
    await page.getByRole('button', { name: adjust.save }).click();
    await page.getByRole('button', { name: adjust.confirm }).click();

    await expect(page).toHaveURL(new RegExp(`/admin/orders/${REFERENCE}$`));
    // The first of them: this spec adds one more note to the same seeded order
    // on every run, and the screen shows the shop's whole account of what it
    // changed rather than only the newest sentence.
    await expect(
      page.getByText('One more pack, as agreed.').first(),
    ).toBeVisible();
    // Nobody was written to, so the order says the customer is behind — which
    // is the row that offers to put that right.
    await expect(
      page.getByRole('button', { name: detail.tellCustomer.action }),
    ).toBeVisible();
  });
});
