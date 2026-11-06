import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localtestEnv, workspaceRoot } from '../support/localtest';

/** The wording is read from the deployment's text, not repeated: a hardcoded
 * label fails when a button is reworded, not when it breaks. */
const adminText = (
  JSON.parse(
    readFileSync(
      join(workspaceRoot, 'deployments/fixture/config/texts/admin.json'),
      'utf8',
    ),
  ) as {
    ordering: {
      orders: {
        detail: {
          actions: { adjust: string };
          revisions: {
            heading: string;
            subheading: string;
            changes: string;
            openControls: string;
          };
          tellCustomer: { update: string };
        };
        adjust: {
          save: string;
          confirm: { confirm: string };
          lines: { unitsAria: string };
          changes: { none: string };
        };
      };
    };
  }
).ordering;
const sharedText = (
  JSON.parse(
    readFileSync(
      join(workspaceRoot, 'deployments/fixture/config/texts/shared.json'),
      'utf8',
    ),
  ) as { ordering: { order: { total: string; changeNote: string } } }
).ordering;
const detail = adminText.orders.detail;
const adjust = adminText.orders.adjust;
const names = sharedText.order;

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/**
 * Adjusting an order (FR-ORD-03) in a browser: the form from the order, the
 * change list, the history after. On the seeded guest order that already has a
 * change, which no queue counts and no spec reads; another change only adds a
 * version.
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
    const lid = page.getByRole('button', {
      name: RegExp(detail.revisions.subheading),
    });
    await lid.click();
    // Inside the panel: the order's own note block repeats the seeded note
    // once the desktop run has added a version.
    const versions = page.locator(
      `#${await lid.getAttribute('aria-controls')}`,
    );

    // What the shop said it changed and, unfolded, the difference, computed
    // only for the opened version.
    await expect(
      versions.getByText(/Only 12 of the espresso left/),
    ).toBeVisible();
    await versions
      .getByRole('button', { name: detail.revisions.changes })
      .first()
      .click();
    await expect(versions.getByText(names.total).first()).toBeVisible();
  });

  /** Reading a version and answering are two screens: the list's title opens
   * the first, whose only control leads to the second. */
  test('opens a version from the list, and the order from the version', async ({
    page,
  }) => {
    await logIn(page);
    // `searchTerm`, not `q`, which is the navbar's: unfiltered, the seeded
    // order drifts off the first page with every placed order.
    await page.goto(`/admin/orders?searchTerm=${REFERENCE}`);

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

    const quantity = page.getByLabel(adjust.lines.unitsAria).first();
    await quantity.fill(String(Number(await quantity.inputValue()) + 1));

    // The server prices the draft; what the change list shows is its answer,
    // and nothing on the page works the total out for itself.
    await expect(page.getByText(names.total)).toBeVisible();
    // Whatever the width, the page itself never scrolls sideways.
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  // One browser: both projects share a database, and two managers on one order
  // is the race the endpoint refuses.
  test('writes a new version and tells the manager what it says', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'the write is asserted once, on one browser');
    await logIn(page);
    await page.goto(`/admin/orders/${REFERENCE}/adjust`);

    const quantity = page.getByLabel(adjust.lines.unitsAria).first();
    await quantity.fill(String(Number(await quantity.inputValue()) + 1));
    await page.getByLabel(names.changeNote).fill('One more pack, as agreed.');
    await page.getByRole('button', { name: adjust.save }).click();
    await page.getByRole('button', { name: adjust.confirm.confirm }).click();

    await expect(page).toHaveURL(new RegExp(`/admin/orders/${REFERENCE}$`));
    // The first of them: this spec adds one more note to the same seeded order
    // on every run, and the screen shows the shop's whole account of what it
    // changed rather than only the newest sentence.
    await expect(
      page.getByText('One more pack, as agreed.').first(),
    ).toBeVisible();
    // Unshown, their page is a version behind, which the customer row fixes:
    // moved on first, or a message would link elsewhere.
    await expect(
      page.getByRole('button', { name: detail.tellCustomer.update }),
    ).toBeVisible();
  });
});
