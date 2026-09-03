import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';

/**
 * Tier price resolution end to end (FR-AUTH-05, ADR 0031): the same product,
 * fetched by a guest and by a customer in a tier, must come back with different
 * prices — and a product the tier does not price must fall back to the base
 * list rather than disappearing or costing nothing.
 *
 * The unit tests assert the SQL's shape; only this one proves the numbers.
 */

const TIER_KEY = 'e2e-tier-wholesale';
const CUSTOMER = 'e2e-tier-customer@example.com';
const PLAIN_CUSTOMER = 'e2e-tier-default@example.com';
const PASSWORD = 'tier-e2e-password';
const OVERRIDE_MINOR = 1;
/** This suite's own category and products, so nothing another suite creates,
 * re-prices or withdraws while it runs can land in the listings it asserts on.
 * Fixed keys, cleaned up in `afterAll` and again on the next run's setup. */
const CATEGORY_SLUG = 'e2e-tier-category';
const PRICED_SLUG = 'e2e-tier-priced';
const UNTOUCHED_SLUG = 'e2e-tier-untouched';
const PRICED_BASE_MINOR = 2500;
const UNTOUCHED_BASE_MINOR = 3700;

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const get = (url: string, cookie = '') =>
  axios.get(url, {
    validateStatus: () => true,
    headers: cookie ? { Cookie: cookie } : {},
  });

async function loginAs(email: string): Promise<string> {
  const res = await axios.post(
    '/auth/login',
    { email, password: PASSWORD },
    { validateStatus: () => true },
  );
  const cookie = (res.headers['set-cookie'] as string[] | undefined)
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error(`login failed for ${email}: ${res.status}`);
  return cookie;
}

describe('Tier prices (FR-AUTH-05)', () => {
  let client: Client;
  let tierCookie = '';
  let defaultCookie = '';

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    await removeFixture();

    // Two products in a category of this suite's own making: one the tier
    // re-prices, one it does not. Built here rather than picked out of the seed
    // because the listing assertions below need a page nothing else can change
    // — other suites create, re-price and withdraw published products of their
    // own while this one runs.
    const { rows: categoryRows } = await client.query(
      `INSERT INTO categories ("sourceId", slug, name)
       VALUES ($1, $1, 'E2E Tier Prices') RETURNING id`,
      [CATEGORY_SLUG],
    );
    const categoryId = categoryRows[0].id;

    await client.query(
      `INSERT INTO products
         ("sourceId", slug, name, "defaultPriceMinor", "categoryId", "publishedAt")
       VALUES ($1, $1, 'Priced by the tier', $2, $4, now()),
              ($3, $3, 'Untouched by the tier', $5, $4, now())`,
      [
        PRICED_SLUG,
        PRICED_BASE_MINOR,
        UNTOUCHED_SLUG,
        categoryId,
        UNTOUCHED_BASE_MINOR,
      ],
    );

    const { rows: tierRows } = await client.query(
      `INSERT INTO customer_tiers (key, label) VALUES ($1, $2) RETURNING id`,
      [TIER_KEY, 'E2E Wholesale'],
    );
    const tierId = tierRows[0].id;

    await client.query(
      `INSERT INTO product_prices ("productId", "tierId", "priceMinor")
       SELECT id, $1, $2 FROM products WHERE slug = $3`,
      [tierId, OVERRIDE_MINOR, PRICED_SLUG],
    );

    const passwordHash = await hash(PASSWORD);
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, "tierId", status)
       VALUES ($1, $2, 'user', $3, 'active')`,
      [CUSTOMER, passwordHash, tierId],
    );
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'user', 'active')`,
      [PLAIN_CUSTOMER, passwordHash],
    );

    tierCookie = await loginAs(CUSTOMER);
    defaultCookie = await loginAs(PLAIN_CUSTOMER);
  });

  /** Everything this suite creates, in dependency order. Also run in `beforeAll`,
   * so a previous run killed before its teardown cannot fail the next one. */
  async function removeFixture(): Promise<void> {
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [CUSTOMER, PLAIN_CUSTOMER],
    ]);
    await client.query(
      `DELETE FROM product_prices WHERE "productId" IN
         (SELECT id FROM products WHERE slug = ANY($1))`,
      [[PRICED_SLUG, UNTOUCHED_SLUG]],
    );
    await client.query('DELETE FROM products WHERE slug = ANY($1)', [
      [PRICED_SLUG, UNTOUCHED_SLUG],
    ]);
    await client.query('DELETE FROM categories WHERE slug = $1', [
      CATEGORY_SLUG,
    ]);
    await client.query('DELETE FROM customer_tiers WHERE key = $1', [TIER_KEY]);
  }

  afterAll(async () => {
    await removeFixture();
    await client.end();
  });

  it('shows a guest the base price', async () => {
    const res = await get(`/catalog/products/${PRICED_SLUG}`);

    expect(res.status).toBe(200);
    expect(res.data.priceMinor).toBe(PRICED_BASE_MINOR);
  });

  it('shows the tiered customer their own price for the same product', async () => {
    const res = await get(`/catalog/products/${PRICED_SLUG}`, tierCookie);

    expect(res.status).toBe(200);
    expect(res.data.priceMinor).toBe(OVERRIDE_MINOR);
    expect(res.data.priceMinor).not.toBe(PRICED_BASE_MINOR);
  });

  it('falls back to the base price for a product the tier does not price', async () => {
    const res = await get(`/catalog/products/${UNTOUCHED_SLUG}`, tierCookie);

    expect(res.status).toBe(200);
    expect(res.data.priceMinor).toBe(UNTOUCHED_BASE_MINOR);
  });

  it('serves the base list to a signed-in customer with no tier', async () => {
    const res = await get(`/catalog/products/${PRICED_SLUG}`, defaultCookie);

    expect(res.status).toBe(200);
    expect(res.data.priceMinor).toBe(PRICED_BASE_MINOR);
  });

  it('treats a junk session cookie as a guest instead of rejecting it', async () => {
    const res = await get(
      `/catalog/products/${PRICED_SLUG}`,
      'session=not-a-real-token',
    );

    expect(res.status).toBe(200);
    expect(res.data.priceMinor).toBe(PRICED_BASE_MINOR);
  });

  it('carries the tier price into a listing and sorts by the resolved value', async () => {
    const res = await get(
      `/catalog/categories/${CATEGORY_SLUG}/products?sort=price`,
      tierCookie,
    );
    expect(res.status).toBe(200);

    const hit = res.data.items.find(
      (i: { slug: string }) => i.slug === PRICED_SLUG,
    );
    expect(hit).toBeDefined();
    expect(hit.priceMinor).toBe(OVERRIDE_MINOR);
    // Re-priced to one minor unit, so an ascending price sort must put it
    // first — the proof that ordering follows resolution rather than the base
    // column, which would have placed it by its original price.
    expect(res.data.items[0].slug).toBe(PRICED_SLUG);
  });

  it('tells caches that a price-bearing response depends on the session', async () => {
    const guest = await get(`/catalog/products/${PRICED_SLUG}`);
    const customer = await get(
      `/catalog/categories/${CATEGORY_SLUG}/products`,
      tierCookie,
    );

    // Vary on both variants: without it a shared cache is free to hand the one
    // it stored to the other kind of visitor.
    expect(guest.headers['vary']).toMatch(/cookie/i);
    expect(customer.headers['vary']).toMatch(/cookie/i);

    // Only the session-shaped one is private. The guest variant stays
    // ordinarily cacheable, which is what lets the session-blind SSR tier put
    // it in the document for hydration (see the web app's api-client.ts).
    expect(customer.headers['cache-control']).toBe('private, no-store');
    expect(guest.headers['cache-control']).toBeUndefined();
  });

  it('never leaks a tier price into a guest listing', async () => {
    const res = await get(
      `/catalog/categories/${CATEGORY_SLUG}/products?sort=price`,
    );
    expect(res.status).toBe(200);

    const hit = res.data.items.find(
      (i: { slug: string }) => i.slug === PRICED_SLUG,
    );
    expect(hit).toBeDefined();
    expect(hit.priceMinor).toBe(PRICED_BASE_MINOR);
    expect(
      res.data.items.map((i: { priceMinor: number }) => i.priceMinor),
    ).not.toContain(OVERRIDE_MINOR);
  });
});
