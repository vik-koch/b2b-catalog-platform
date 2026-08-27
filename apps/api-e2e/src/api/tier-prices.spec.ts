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
  // Two seeded products: one the tier re-prices, one it does not.
  let pricedSlug = '';
  let pricedBaseMinor = 0;
  let untouchedSlug = '';
  let untouchedBaseMinor = 0;
  let categorySlug = '';

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    // Two products from one category, so the listing assertions below have a
    // deterministic page to look at.
    const { rows } = await client.query(
      // Published, not merely undeleted: other suites seed unpublished and
      // soft-deleted products of their own, and a category picked with one of
      // those in it makes every read below a 404.
      `SELECT p.slug, p."defaultPriceMinor", c.slug AS "categorySlug"
         FROM products p
         JOIN categories c ON c.id = p."categoryId"
        WHERE p."deletedAt" IS NULL
          AND p."publishedAt" IS NOT NULL
          AND p."categoryId" = (
            SELECT "categoryId" FROM products
             WHERE "deletedAt" IS NULL AND "publishedAt" IS NOT NULL
             GROUP BY "categoryId" HAVING count(*) >= 2 LIMIT 1)
        ORDER BY p.name LIMIT 2`,
    );
    pricedSlug = rows[0].slug;
    pricedBaseMinor = rows[0].defaultPriceMinor;
    untouchedSlug = rows[1].slug;
    untouchedBaseMinor = rows[1].defaultPriceMinor;
    categorySlug = rows[0].categorySlug;

    await client.query('DELETE FROM customer_tiers WHERE key = $1', [TIER_KEY]);
    const { rows: tierRows } = await client.query(
      `INSERT INTO customer_tiers (key, label) VALUES ($1, $2) RETURNING id`,
      [TIER_KEY, 'E2E Wholesale'],
    );
    const tierId = tierRows[0].id;

    await client.query(
      `INSERT INTO product_prices ("productId", "tierId", "priceMinor")
       SELECT id, $1, $2 FROM products WHERE slug = $3`,
      [tierId, OVERRIDE_MINOR, pricedSlug],
    );

    const passwordHash = await hash(PASSWORD);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [CUSTOMER, PLAIN_CUSTOMER],
    ]);
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

  afterAll(async () => {
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [CUSTOMER, PLAIN_CUSTOMER],
    ]);
    await client.query(
      `DELETE FROM product_prices WHERE "tierId" IN
         (SELECT id FROM customer_tiers WHERE key = $1)`,
      [TIER_KEY],
    );
    await client.query('DELETE FROM customer_tiers WHERE key = $1', [TIER_KEY]);
    await client.end();
  });

  it('shows a guest the base price', async () => {
    const res = await get(`/catalog/products/${pricedSlug}`);

    expect(res.status).toBe(200);
    expect(res.data.priceMinor).toBe(pricedBaseMinor);
  });

  it('shows the tiered customer their own price for the same product', async () => {
    const res = await get(`/catalog/products/${pricedSlug}`, tierCookie);

    expect(res.status).toBe(200);
    expect(res.data.priceMinor).toBe(OVERRIDE_MINOR);
    expect(res.data.priceMinor).not.toBe(pricedBaseMinor);
  });

  it('falls back to the base price for a product the tier does not price', async () => {
    const res = await get(`/catalog/products/${untouchedSlug}`, tierCookie);

    expect(res.status).toBe(200);
    expect(res.data.priceMinor).toBe(untouchedBaseMinor);
  });

  it('serves the base list to a signed-in customer with no tier', async () => {
    const res = await get(`/catalog/products/${pricedSlug}`, defaultCookie);

    expect(res.status).toBe(200);
    expect(res.data.priceMinor).toBe(pricedBaseMinor);
  });

  it('treats a junk session cookie as a guest instead of rejecting it', async () => {
    const res = await get(
      `/catalog/products/${pricedSlug}`,
      'session=not-a-real-token',
    );

    expect(res.status).toBe(200);
    expect(res.data.priceMinor).toBe(pricedBaseMinor);
  });

  it('carries the tier price into a listing and sorts by the resolved value', async () => {
    const res = await get(
      `/catalog/categories/${categorySlug}/products?sort=price`,
      tierCookie,
    );
    expect(res.status).toBe(200);

    const hit = res.data.items.find(
      (i: { slug: string }) => i.slug === pricedSlug,
    );
    expect(hit).toBeDefined();
    expect(hit.priceMinor).toBe(OVERRIDE_MINOR);
    // Re-priced to one minor unit, so an ascending price sort must put it
    // first — the proof that ordering follows resolution rather than the base
    // column, which would have placed it by its original price.
    expect(res.data.items[0].slug).toBe(pricedSlug);
  });

  it('tells caches that a price-bearing response depends on the session', async () => {
    const guest = await get(`/catalog/products/${pricedSlug}`);
    const customer = await get(
      `/catalog/categories/${categorySlug}/products`,
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
      `/catalog/categories/${categorySlug}/products?sort=price`,
    );
    expect(res.status).toBe(200);

    const hit = res.data.items.find(
      (i: { slug: string }) => i.slug === pricedSlug,
    );
    expect(hit).toBeDefined();
    expect(hit.priceMinor).toBe(pricedBaseMinor);
    expect(
      res.data.items.map((i: { priceMinor: number }) => i.priceMinor),
    ).not.toContain(OVERRIDE_MINOR);
  });
});
