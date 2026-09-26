import { hash } from '@node-rs/argon2';
import { expect, Page, test, TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  documentOf,
  localtestDbClient,
  workspaceRoot,
} from './support/localtest';

/**
 * A customer's own prices on a cold-loaded page (FR-AUTH-05) — a click from
 * another page already asked the API with the cookie and was never wrong.
 *
 * Asserted twice over, because a locator only sees what the page settles on.
 * What it *paints first* is in the HTML the server sent, and painting the
 * default price before correcting it is the failure this spec exists for.
 *
 * The server renders as the visitor (ADR 0031, 2026-09-25 amendment), so the
 * customer's price is in that HTML — which makes the document as personal as
 * the answers in it. Its cache headers are asserted here too: they are what
 * keeps one customer's page out of every shared cache.
 */

const PASSWORD = 'e2e-tier-price-password';
/** One minor unit, so the tier price can never coincide with a seeded one. */
const OVERRIDE_MINOR = 1;

/** The deployment's own currency and locale — the same source the app formats
 * prices from, so this spec cannot drift from the page it reads. */
const { code, locale } = JSON.parse(
  readFileSync(join(workspaceRoot, 'config/deployment.json'), 'utf8'),
).catalog.currency;

const currency = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: code,
});
/** The currency's minor-unit exponent — 2 for EUR, 0 for JPY. */
const DIGITS = currency.resolvedOptions().maximumFractionDigits ?? 2;

function money(priceMinor: number): string {
  return currency.format(priceMinor / 10 ** DIGITS);
}

/** The amount as the markup carries it, without the currency symbol: what
 * separates the two is a non-breaking space whose exact codepoint is the
 * formatter's business and not this spec's. */
function amount(priceMinor: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: DIGITS,
    maximumFractionDigits: DIGITS,
  }).format(priceMinor / 10 ** DIGITS);
}

// Every worker arranges its own tier and account: the projects (desktop,
// mobile) run concurrently and the suite is fully parallel, so a name shared
// across workers would have one of them deleting the tier another had just
// pointed an account at. The override rows hang off the tier, so the workers
// can still share one product.
const namesFor = ({ project, workerIndex }: TestInfo) => ({
  tierKey: `e2e-${project.name}-${workerIndex}-tier-prices`,
  email: `e2e-${project.name}-${workerIndex}-tier-prices@example.com`,
});

interface Fixture {
  slug: string;
  name: string;
  categorySlug: string;
  basePriceMinor: number;
}

async function arrange(testInfo: TestInfo): Promise<Fixture> {
  const { tierKey, email } = namesFor(testInfo);
  const client = localtestDbClient();
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT p.slug, p.name, dp."priceMinor" AS "defaultPriceMinor",
              c.slug AS "categorySlug"
         FROM products p
         JOIN categories c ON c.id = p."categoryId"
         JOIN customer_tiers dt ON dt."isDefault"
         JOIN product_prices dp
           ON dp."productId" = p.id AND dp."tierId" = dt.id
        WHERE p."deletedAt" IS NULL AND p."publishedAt" IS NOT NULL
        ORDER BY p.name LIMIT 1`,
    );
    const product = rows[0];

    // Overrides first: the tier's FK is RESTRICT, so a leftover row from an
    // interrupted run would otherwise block its own cleanup.
    await client.query('DELETE FROM users WHERE email = $1', [email]);
    await client.query(
      `DELETE FROM product_prices WHERE "tierId" IN
         (SELECT id FROM customer_tiers WHERE key = $1)`,
      [tierKey],
    );
    await client.query('DELETE FROM customer_tiers WHERE key = $1', [tierKey]);
    const { rows: tiers } = await client.query(
      `INSERT INTO customer_tiers (key, label) VALUES ($1, $2) RETURNING id`,
      [tierKey, `E2E ${testInfo.project.name} ${testInfo.workerIndex}`],
    );
    await client.query(
      `INSERT INTO product_prices ("productId", "tierId", "priceMinor")
       SELECT id, $1, $2 FROM products WHERE slug = $3`,
      [tiers[0].id, OVERRIDE_MINOR, product.slug],
    );
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, "tierId", status, "mustChangePassword")
       VALUES ($1, $2, 'user', $3, 'active', false)`,
      [email, await hash(PASSWORD), tiers[0].id],
    );

    return {
      slug: product.slug,
      name: product.name,
      categorySlug: product.categorySlug,
      basePriceMinor: product.defaultPriceMinor,
    };
  } finally {
    await client.end();
  }
}

async function cleanUp(testInfo: TestInfo): Promise<void> {
  const { tierKey, email } = namesFor(testInfo);
  const client = localtestDbClient();
  await client.connect();
  try {
    await client.query('DELETE FROM users WHERE email = $1', [email]);
    await client.query(
      `DELETE FROM product_prices WHERE "tierId" IN
         (SELECT id FROM customer_tiers WHERE key = $1)`,
      [tierKey],
    );
    await client.query('DELETE FROM customer_tiers WHERE key = $1', [tierKey]);
  } finally {
    await client.end();
  }
}

async function logIn(page: Page, testInfo: TestInfo): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(namesFor(testInfo).email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.describe('tier prices on a server-rendered page', () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    fixture = await arrange(test.info());
  });

  test.afterAll(async () => {
    await cleanUp(test.info());
  });

  test('server-renders the default price for a guest', async ({ page }) => {
    const response = await page.goto(`/product/${fixture.slug}`);

    // In the document itself, not merely on screen once JavaScript has run:
    // this is the render a crawler indexes and the one everyone else paints
    // immediately. Deferring it to the browser for *everybody* would make the
    // customer assertion below pass for the wrong reason.
    expect(await documentOf(response)).toContain(
      amount(fixture.basePriceMinor),
    );
    await expect(page.getByText(money(fixture.basePriceMinor))).toBeVisible();

    // The same for everybody, so a cache may keep it — but only per cookie
    // jar, so it can never be handed to someone signed in.
    const headers = response?.headers() ?? {};
    expect(headers['cache-control'] ?? '').not.toMatch(/private|no-store/);
    expect(headers['vary'] ?? '').toMatch(/cookie/i);
  });

  test('server-renders a cold-loaded product page with the customer’s price', async ({
    page,
  }, testInfo) => {
    await logIn(page, testInfo);

    const afterLoad: string[] = [];
    page.on('request', (request) => {
      if (/\/api\/(catalog|auth\/me)\b/.test(request.url())) {
        afterLoad.push(request.url());
      }
    });

    // The work counts are asked only once the session is known in the
    // browser, so anything hydration would fetch again has gone out first.
    const settled = page.waitForResponse((r) =>
      r.url().includes('/api/work/counts'),
    );
    // A fresh document — the server render, asked as this customer.
    const response = await page.goto(`/product/${fixture.slug}`);

    // Their own price is in the markup, the default one nowhere — not even
    // for a frame.
    const html = await documentOf(response);
    expect(html).toContain(amount(OVERRIDE_MINOR));
    expect(html).not.toContain(amount(fixture.basePriceMinor));
    await expect(page.getByText(money(OVERRIDE_MINOR))).toBeVisible();
    await expect(page.getByText(money(fixture.basePriceMinor))).toHaveCount(0);

    // A page holding one customer's prices is theirs alone.
    const headers = response?.headers() ?? {};
    expect(headers['cache-control']).toMatch(/private/);
    expect(headers['cache-control']).toMatch(/no-store/);
    expect(headers['vary'] ?? '').toMatch(/cookie/i);

    // Hydration replays what the server asked instead of asking again.
    await settled;
    expect(afterLoad).toEqual([]);
  });

  test('answers 404 for a missing product, signed in too', async ({
    page,
  }, testInfo) => {
    await logIn(page, testInfo);

    const response = await page.goto('/product/e2e-no-such-product');

    expect(response?.status()).toBe(404);
  });

  test('corrects a cold-loaded category listing too', async ({
    page,
  }, testInfo) => {
    await logIn(page, testInfo);

    await page.goto(`/catalog/${fixture.categorySlug}`);

    // The grid item, not the name link inside it: the price is the tile's
    // sibling element, so only the item holds both.
    const tile = page.locator('li').filter({ hasText: fixture.name }).first();
    await expect(tile).toContainText(money(OVERRIDE_MINOR));
  });
});
