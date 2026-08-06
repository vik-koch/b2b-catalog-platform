import { hash } from '@node-rs/argon2';
import { expect, Page, test, TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localtestDbClient, workspaceRoot } from './support/localtest';

/**
 * A customer's own prices on a *server-rendered* page (FR-AUTH-05).
 *
 * The SSR tier never sees the visitor's session, so every document it renders
 * carries the default price list. The browser is what corrects that, and only
 * a real one proves it: a cold load of a catalog URL, not a click from another
 * page, because the two take different paths through the transfer cache.
 */

const PASSWORD = 'e2e-tier-price-password';
/** One minor unit, so the tier price can never coincide with a seeded one. */
const OVERRIDE_MINOR = 1;

/** The deployment's own currency and locale — the same source the app formats
 * prices from, so this spec cannot drift from the page it reads. */
const { code, locale } = JSON.parse(
  readFileSync(join(workspaceRoot, 'config/deployment.json'), 'utf8'),
).catalog.currency;

function money(priceMinor: number): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(priceMinor / 10 ** digits);
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
        WHERE p."deletedAt" IS NULL
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

  test('shows a guest the default price', async ({ page }) => {
    await page.goto(`/product/${fixture.slug}`);

    await expect(page.getByText(money(fixture.basePriceMinor))).toBeVisible();
  });

  test('corrects a cold-loaded product page to the customer’s price', async ({
    page,
  }, testInfo) => {
    await logIn(page, testInfo);

    // A fresh document, so what arrives is the session-blind render.
    await page.goto(`/product/${fixture.slug}`);

    await expect(page.getByText(money(OVERRIDE_MINOR))).toBeVisible();
    // The default price must not be left anywhere on the page: a corrected
    // price beside the one it replaced is worse than either alone.
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
