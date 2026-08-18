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
      `SELECT p.slug, p.name, p."defaultPriceMinor", c.slug AS "categorySlug"
         FROM products p
         JOIN categories c ON c.id = p."categoryId"
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
  });

  test('corrects a cold-loaded product page to the customer’s price', async ({
    page,
  }, testInfo) => {
    await logIn(page, testInfo);

    // A fresh document — the server render, which cannot know their tier.
    const response = await page.goto(`/product/${fixture.slug}`);

    // Never painted, not even for a frame: the price this customer must not be
    // shown is absent from the markup, so the first thing they see is their own
    // price arriving rather than the default one being taken back.
    expect(await documentOf(response)).not.toContain(
      amount(fixture.basePriceMinor),
    );
    await expect(page.getByText(money(OVERRIDE_MINOR))).toBeVisible();
    await expect(page.getByText(money(fixture.basePriceMinor))).toHaveCount(0);
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
