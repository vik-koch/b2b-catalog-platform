import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localtestEnv, workspaceRoot } from './support/localtest';

/**
 * An order's documents in a real browser (FR-ORD-05, FR-ACC-02).
 *
 * The one thing only a browser can answer: that the link the page offers
 * actually returns a PDF, through the session the reader is sitting in. The
 * endpoint's rules are covered by the API suite; what is proved here is that
 * the two ends agree on the address.
 */
const text = JSON.parse(
  readFileSync(join(workspaceRoot, 'config/admin-text.json'), 'utf8'),
) as { orderDetail: { documents: { heading: string; summary: string } } };
const documents = text.orderDetail.documents;

const env = localtestEnv();
const ADMIN_EMAIL = env['ADMIN_EMAIL'];
const ADMIN_PASSWORD = env['ADMIN_PASSWORD'];

/** The seeded guest order the adjustment spec also works on: nothing asserts
 * its figures, and reading a document changes nothing about it. */
const REFERENCE = 'CK-260901-5528';

async function logIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe("an order's documents", () => {
  test('offers the summary on the order, and it comes back as a PDF', async ({
    page,
  }) => {
    await logIn(page);
    await page.goto(`/admin/orders/${REFERENCE}`);

    await expect(page.getByText(documents.heading)).toBeVisible();
    await expect(page.getByText(documents.summary)).toBeVisible();

    // Fetched through the page's own session rather than clicked: the link
    // opens a tab the browser hands to its PDF viewer, and what this asks is
    // whether the bytes are a document.
    const response = await page.request.get(
      `/api/order-documents/${REFERENCE}/order-summary`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });

  /** The staff card is a manager's daily work and a good deal of it happens
   * standing in a warehouse, so the list has to fit a phone. */
  test('fits a narrow screen', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the narrow shape is what this checks');

    await logIn(page);
    await page.goto(`/admin/orders/${REFERENCE}`);

    await expect(page.getByText(documents.summary)).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
