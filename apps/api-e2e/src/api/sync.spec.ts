import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

/**
 * The bulk catalog sync (FR-ADM-02, ADR 0026), end-to-end against the real API
 * and database: auth guards, CSV parsing at the edge, the staged
 * preview → commit flow in a transaction, category creation, restore, and the
 * option gate on deletion.
 *
 * Isolation: every product this spec creates lives under a category it creates
 * itself, and all of it is removed in afterAll. The one catalog-wide operation —
 * the delete sweep — is only ever *previewed* here, never committed, because
 * committing it would soft-delete the seeded catalog the storefront specs count.
 * The sweep's rules are covered exhaustively by the differ's unit tests.
 */

const ADMIN_EMAIL = 'e2e-sync-admin@example.com';
const MANAGER_EMAIL = 'e2e-sync-manager@example.com';
const PASSWORD = 'e2e-sync-password';

// Per-run suffix so a previous crashed run's leftovers can't collide.
const R = Date.now().toString(36);
const CATEGORY_NAME = `E2E Sync Category ${R}`;
const SOURCE_PREFIX = `e2e-sync-${R}`;
const CATEGORY_SOURCE_ID = `e2e-sync-cat-${R}`;
const TIER_KEY = `e2e-sync-tier-${R}`;

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error('expected a session cookie');
  return cookie;
}

async function loginAs(email: string): Promise<string> {
  const res = await axios.post('/auth/login', { email, password: PASSWORD });
  return sessionCookie(res.headers['set-cookie']);
}

function csvForm(csv: string, options?: Record<string, unknown>): FormData {
  const data = new FormData();
  data.append('file', new Blob([csv], { type: 'text/csv' }), 'catalog.csv');
  if (options) data.append('options', JSON.stringify(options));
  return data;
}

describe('Catalog sync (FR-ADM-02)', () => {
  let client: Client;
  let adminCookie: string;
  let managerCookie: string;

  const preview = (data: FormData | undefined, cookie = adminCookie) =>
    axios.post('/admin/sync/preview', data, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const commit = (id: string, cookie = adminCookie) =>
    axios.post(
      `/admin/sync/runs/${id}/commit`,
      {},
      {
        headers: cookie ? { Cookie: cookie } : {},
        validateStatus: () => true,
      },
    );
  const get = (url: string, cookie = adminCookie) =>
    axios.get(url, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });

  /** Preview and immediately commit — the ordinary admin flow. */
  async function run(csv: string, options?: Record<string, unknown>) {
    const previewed = await preview(csvForm(csv, options));
    expect(previewed.status).toBe(201);
    const committed = await commit(previewed.data.run.id);
    expect(committed.status).toBe(200);
    return { plan: previewed.data.plan, applied: committed.data.applied };
  }

  const productBySourceId = async (sourceId: string) => {
    const { rows } = await client.query(
      'SELECT name, "defaultPriceMinor" AS "priceMinor", slug, "deletedAt", "publishedAt", "categoryId" FROM products WHERE "sourceId" = $1',
      [sourceId],
    );
    return rows[0];
  };

  /** A product's overrides, keyed by tier key — what a customer would be charged. */
  const tierPricesOf = async (sourceId: string) => {
    const { rows } = await client.query(
      `SELECT t.key, pp."priceMinor" FROM product_prices pp
         JOIN products p ON p.id = pp."productId"
         JOIN customer_tiers t ON t.id = pp."tierId"
        WHERE p."sourceId" = $1`,
      [sourceId],
    );
    return Object.fromEntries(
      rows.map((r: { key: string; priceMinor: number }) => [
        r.key,
        r.priceMinor,
      ]),
    );
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    const passwordHash = await hash(PASSWORD);
    for (const [email, role] of [
      [ADMIN_EMAIL, 'admin'],
      [MANAGER_EMAIL, 'manager'],
    ] as const) {
      await client.query('DELETE FROM users WHERE email = $1', [email]);
      await client.query(
        `INSERT INTO users (email, "passwordHash", role, status)
         VALUES ($1, $2, $3, 'active')`,
        [email, passwordHash, role],
      );
    }
    adminCookie = await loginAs(ADMIN_EMAIL);
    managerCookie = await loginAs(MANAGER_EMAIL);

    await client.query('DELETE FROM customer_tiers WHERE key = $1', [TIER_KEY]);
    await client.query(
      'INSERT INTO customer_tiers (key, label) VALUES ($1, $2)',
      [TIER_KEY, `E2E sync tier ${R}`],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM products WHERE "sourceId" LIKE $1', [
      `${SOURCE_PREFIX}%`,
    ]);
    await client.query('DELETE FROM categories WHERE "sourceId" = $1', [
      CATEGORY_SOURCE_ID,
    ]);
    // Products go first: their overrides cascade, and the tier's FK restricts.
    await client.query('DELETE FROM customer_tiers WHERE key = $1', [TIER_KEY]);
    await client.query('DELETE FROM sync_runs WHERE "actorEmail" = $1', [
      ADMIN_EMAIL,
    ]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL],
    ]);
    await client.end();
  });

  describe('authorization', () => {
    it('rejects an anonymous preview and an anonymous commit', async () => {
      expect((await preview(csvForm('sourceId\nx\n'), '')).status).toBe(401);
      expect(
        (await commit('00000000-0000-0000-0000-000000000000', '')).status,
      ).toBe(401);
      expect((await get('/admin/sync/runs', '')).status).toBe(401);
    });

    it('rejects a manager — the sync is admin-only', async () => {
      expect(
        (await preview(csvForm('sourceId\nx\n'), managerCookie)).status,
      ).toBe(403);
      expect((await get('/admin/sync/runs', managerCookie)).status).toBe(403);
    });
  });

  describe('the file itself', () => {
    it('refuses a file with no sourceId column', async () => {
      const res = await preview(csvForm('name,price\nBeans,100\n'));
      expect(res.status).toBe(400);
      expect(res.data).toMatchObject({
        code: 'missing-required-column',
        data: { params: { column: 'sourceId' } },
      });
    });

    it('refuses a request with no file at all', async () => {
      const res = await preview(new FormData());
      expect(res.status).toBe(400);
    });

    it('refuses options that would delete without authority over the product set', async () => {
      const res = await preview(
        csvForm(`sourceId\n${SOURCE_PREFIX}-1\n`, {
          softDeleteMissingProducts: true,
        }),
      );
      expect(res.status).toBe(400);
      expect(res.data.code).toBe('options-invalid');
    });
  });

  describe('preview then commit', () => {
    it('previews without writing anything, then applies on commit', async () => {
      const csv = [
        'sourceId,name,categorySourceId,categoryName,price',
        `${SOURCE_PREFIX}-1,Sync Beans,${CATEGORY_SOURCE_ID},${CATEGORY_NAME},1890`,
        '',
      ].join('\n');

      const previewed = await preview(csvForm(csv));
      expect(previewed.status).toBe(201);
      expect(previewed.data.run.status).toBe('previewed');
      expect(previewed.data.plan.summary).toMatchObject({
        rows: 1,
        create: 1,
        categoriesCreated: 1,
        errors: 0,
      });
      expect(previewed.data.plan.categories).toEqual([
        { kind: 'create', name: CATEGORY_NAME, from: null, productCount: 1 },
      ]);
      // The preview is a dry run: nothing exists yet.
      expect(await productBySourceId(`${SOURCE_PREFIX}-1`)).toBeUndefined();

      const committed = await commit(previewed.data.run.id);
      expect(committed.status).toBe(200);
      expect(committed.data.run.status).toBe('applied');
      expect(committed.data.applied).toMatchObject({ create: 1 });

      const product = await productBySourceId(`${SOURCE_PREFIX}-1`);
      expect(product).toMatchObject({
        name: 'Sync Beans',
        priceMinor: 1890,
        slug: 'sync-beans',
        deletedAt: null,
      });

      // The category was created unparented, for an admin to place in the tree.
      const { rows } = await client.query(
        'SELECT "parentId", "sourceId" FROM categories WHERE name = $1',
        [CATEGORY_NAME],
      );
      expect(rows[0].parentId).toBeNull();
      expect(rows[0].sourceId).toBe(CATEGORY_SOURCE_ID);
    });

    it('creates products unpublished and never unpublishes a live one', async () => {
      // An imported product carries a price whose basis nobody has set, so it
      // waits for a human (FR-ADM-06) — and the next run of the same file must
      // not take a reviewed product back off the storefront.
      const sourceId = `${SOURCE_PREFIX}-publication`;
      const row = (price: number) =>
        [
          'sourceId,name,categorySourceId,categoryName,price',
          `${sourceId},Sync Publication,${CATEGORY_SOURCE_ID},${CATEGORY_NAME},${price}`,
          '',
        ].join('\n');

      await run(row(1000));
      expect((await productBySourceId(sourceId)).publishedAt).toBeNull();

      // An admin reviews it and puts it on the storefront.
      await client.query(
        'UPDATE products SET "publishedAt" = now() WHERE "sourceId" = $1',
        [sourceId],
      );

      await run(row(1100));

      const after = await productBySourceId(sourceId);
      expect(after.priceMinor).toBe(1100);
      expect(after.publishedAt).not.toBeNull();
    });

    it('refuses to commit the same run twice', async () => {
      const previewed = await preview(
        csvForm(`sourceId,price\n${SOURCE_PREFIX}-1,1890\n`),
      );
      expect((await commit(previewed.data.run.id)).status).toBe(200);

      const again = await commit(previewed.data.run.id);
      expect(again.status).toBe(409);
      expect(again.data.code).toBe('run-already-applied');
    });

    it('404s on an unknown run', async () => {
      const res = await commit('00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });

    it('updates only the fields the run declares', async () => {
      // A price-only run: the file's name column is ignored entirely.
      const { applied } = await run(
        [
          'sourceId,name,price',
          `${SOURCE_PREFIX}-1,Renamed By File,2490`,
          '',
        ].join('\n'),
        { fields: [] },
      );

      expect(applied).toMatchObject({ update: 1 });
      expect(await productBySourceId(`${SOURCE_PREFIX}-1`)).toMatchObject({
        name: 'Sync Beans',
        priceMinor: 2490,
      });
    });

    it('reports an unchanged row as unchanged', async () => {
      const { applied } = await run(
        `sourceId,price\n${SOURCE_PREFIX}-1,2490\n`,
      );
      expect(applied).toMatchObject({ unchanged: 1, update: 0 });
    });

    it('keeps the slug fixed when the file renames a product', async () => {
      await run(
        [
          'sourceId,name,categorySourceId,categoryName,price',
          `${SOURCE_PREFIX}-1,Sync Beans Reserve,${CATEGORY_SOURCE_ID},${CATEGORY_NAME},2490`,
          '',
        ].join('\n'),
      );

      expect(await productBySourceId(`${SOURCE_PREFIX}-1`)).toMatchObject({
        name: 'Sync Beans Reserve',
        // Unchanged: a moved URL breaks links (ADR 0022).
        slug: 'sync-beans',
      });
    });

    it('renames a category in place rather than creating a second one', async () => {
      const renamed = `${CATEGORY_NAME} Reserve`;
      const before = await client.query(
        'SELECT slug FROM categories WHERE "sourceId" = $1',
        [CATEGORY_SOURCE_ID],
      );
      const { plan, applied } = await run(
        [
          'sourceId,name,categorySourceId,categoryName,price',
          `${SOURCE_PREFIX}-1,Sync Beans Reserve,${CATEGORY_SOURCE_ID},${renamed},2490`,
          '',
        ].join('\n'),
      );

      expect(plan.categories).toEqual([
        {
          kind: 'rename',
          name: renamed,
          from: CATEGORY_NAME,
          productCount: 1,
        },
      ]);
      expect(applied).toMatchObject({ categoriesRenamed: 1 });

      const { rows } = await client.query(
        'SELECT name, slug FROM categories WHERE "sourceId" = $1',
        [CATEGORY_SOURCE_ID],
      );
      expect(rows).toHaveLength(1);
      // The name moves; the URL does not.
      expect(rows[0]).toMatchObject({
        name: renamed,
        slug: before.rows[0].slug,
      });

      // Put it back, so the rest of the spec sees the original name.
      await client.query(
        'UPDATE categories SET name = $1 WHERE "sourceId" = $2',
        [CATEGORY_NAME, CATEGORY_SOURCE_ID],
      );
    });

    it('skips a bad row and applies the good ones', async () => {
      const { plan, applied } = await run(
        [
          'sourceId,name,categorySourceId,categoryName,price',
          `${SOURCE_PREFIX}-2,Sync Grinder,${CATEGORY_SOURCE_ID},${CATEGORY_NAME},4900`,
          `${SOURCE_PREFIX}-3,Broken,${CATEGORY_SOURCE_ID},${CATEGORY_NAME},19.90`,
          '',
        ].join('\n'),
      );

      expect(plan.rowErrors).toHaveLength(1);
      expect(plan.rowErrors[0]).toMatchObject({ row: 2 });
      expect(applied).toMatchObject({ create: 1, errors: 1 });
      expect(await productBySourceId(`${SOURCE_PREFIX}-2`)).toBeDefined();
      expect(await productBySourceId(`${SOURCE_PREFIX}-3`)).toBeUndefined();
    });

    it('restores a soft-deleted product that returns in the file', async () => {
      await client.query(
        'UPDATE products SET "deletedAt" = now() WHERE "sourceId" = $1',
        [`${SOURCE_PREFIX}-2`],
      );

      const { applied } = await run(
        `sourceId,price\n${SOURCE_PREFIX}-2,4900\n`,
      );

      expect(applied).toMatchObject({ restore: 1 });
      expect(await productBySourceId(`${SOURCE_PREFIX}-2`)).toMatchObject({
        deletedAt: null,
      });
    });
  });

  describe('the delete sweep (previewed only — committing it would empty the seeded catalog)', () => {
    it('plans to soft-delete everything absent from an authoritative file', async () => {
      const res = await preview(
        csvForm(`sourceId,price\n${SOURCE_PREFIX}-1,2490\n`, {
          softDeleteMissingProducts: true,
          productSetAuthoritative: true,
        }),
      );

      expect(res.status).toBe(201);
      expect(res.data.plan.summary.softDelete).toBeGreaterThan(0);
      const swept = res.data.plan.products.filter(
        (p: { kind: string }) => p.kind === 'softDelete',
      );
      // The seeded catalog is absent from this file, so it is all in the sweep —
      // which is exactly why the preview exists before a commit.
      expect(swept.length).toBe(res.data.plan.summary.softDelete);
      // Nothing was written.
      expect(await productBySourceId(`${SOURCE_PREFIX}-2`)).toMatchObject({
        deletedAt: null,
      });
    });
  });

  describe('the audit trail', () => {
    it('lists runs newest first and names the last applied one', async () => {
      const res = await get('/admin/sync/runs');

      expect(res.status).toBe(200);
      expect(res.data.total).toBeGreaterThan(0);
      expect(res.data.runs[0].actorEmail).toBe(ADMIN_EMAIL);
      expect(res.data.lastApplied).toMatchObject({
        status: 'applied',
        source: 'upload',
        filename: 'catalog.csv',
        actorEmail: ADMIN_EMAIL,
      });
      expect(res.data.lastApplied.finishedAt).not.toBeNull();
    });

    it('serves one run, with its plan gone once it has been applied', async () => {
      const runs = await get('/admin/sync/runs');
      const applied = runs.data.lastApplied;

      const res = await get(`/admin/sync/runs/${applied.id}`);
      expect(res.status).toBe(200);
      expect(res.data.run.id).toBe(applied.id);
      // Staged rows are dropped on commit; the summary is the record.
      expect(res.data.plan).toBeNull();
    });

    it('404s on an unknown run', async () => {
      const res = await get(
        '/admin/sync/runs/00000000-0000-0000-0000-000000000000',
      );
      expect(res.status).toBe(404);
    });
  });
  describe('tier price lists (FR-AUTH-05)', () => {
    const sourceId = `${SOURCE_PREFIX}-tier`;

    it('creates a product with a base price and a tier price in one row', async () => {
      const { applied } = await run(
        [
          `sourceId,name,categorySourceId,categoryName,price,price:${TIER_KEY}`,
          `${sourceId},Tiered Beans,${CATEGORY_SOURCE_ID},${CATEGORY_NAME},1890,1500`,
        ].join('\n'),
      );

      expect(applied.create).toBe(1);
      expect((await productBySourceId(sourceId)).priceMinor).toBe(1890);
      expect(await tierPricesOf(sourceId)).toEqual({ [TIER_KEY]: 1500 });
    });

    it('updates one list without disturbing the other', async () => {
      await run(`sourceId,price:${TIER_KEY}\n${sourceId},1400\n`);

      // The file carried no base price, so the base price is where it was.
      expect((await productBySourceId(sourceId)).priceMinor).toBe(1890);
      expect(await tierPricesOf(sourceId)).toEqual({ [TIER_KEY]: 1400 });
    });

    it('leaves an override alone when the file no longer mentions its list', async () => {
      await run(`sourceId,price\n${sourceId},1990\n`);

      // Absent is not empty: a partial export must not silently un-price a
      // tier. Clearing an override is an admin action in the product editor.
      expect((await productBySourceId(sourceId)).priceMinor).toBe(1990);
      expect(await tierPricesOf(sourceId)).toEqual({ [TIER_KEY]: 1400 });
    });

    it('shows the change per list in the preview, before anything is written', async () => {
      const previewed = await preview(
        csvForm(`sourceId,price:${TIER_KEY}\n${sourceId},1300\n`),
      );

      expect(previewed.status).toBe(201);
      const change = previewed.data.plan.products[0];
      expect(change.changes).toEqual([
        { field: `price:${TIER_KEY}`, from: 1400, to: 1300 },
      ]);
      // Previewed only — nothing committed, so the stored price has not moved.
      expect(await tierPricesOf(sourceId)).toEqual({ [TIER_KEY]: 1400 });
    });

    it('skips a row naming a price list this deployment does not have', async () => {
      const { plan, applied } = await run(
        `sourceId,price:no-such-list\n${sourceId},1\n`,
      );

      expect(applied.errors).toBe(1);
      expect(plan.rowErrors[0]).toMatchObject({
        code: 'unknown-price-list',
        params: { key: 'no-such-list' },
      });
      // The params name the keys that would have worked.
      expect(plan.rowErrors[0].params?.known).toContain(TIER_KEY);
      expect(await tierPricesOf(sourceId)).toEqual({ [TIER_KEY]: 1400 });
    });
  });
});
