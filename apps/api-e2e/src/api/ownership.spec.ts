import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

/**
 * The ownership switch (FR-ADM-10), end to end: what the API refuses while an
 * external system owns the catalog, and what it refuses while nobody does.
 *
 * This spec turns a **global** setting on. The api-e2e specs share one API
 * process, so it must not run beside the ones it would change the answer for —
 * see the note on `fileParallelism` in the vitest config. Every test here
 * restores the switch in a `finally`, and the suite leaves it off.
 *
 * Isolation otherwise as elsewhere: the product and category this spec writes
 * to are its own, and it never applies a catalog-wide run.
 */

const ADMIN_EMAIL = 'e2e-ownership-admin@example.com';
const MANAGER_EMAIL = 'e2e-ownership-manager@example.com';
const PASSWORD = 'e2e-ownership-password';

const R = Date.now().toString(36);
const CATEGORY_NAME = `E2E Ownership Category ${R}`;
const CATEGORY_SOURCE_ID = `e2e-own-cat-${R}`;
const PRODUCT_NAME = `E2E Ownership Product ${R}`;
const PRODUCT_SOURCE_ID = `e2e-own-${R}`;
const TOKEN_NAME = `e2e ownership ${R}`;
const TIER_KEY = `e2e-own-tier-${R}`;
const TIER_LABEL = `E2E Ownership Tier ${R}`;

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error('expected a session cookie');
  return cookie;
}

describe('External data ownership (FR-ADM-10)', () => {
  let client: Client;
  let adminCookie: string;
  let managerCookie: string;
  let token: string;
  let categoryId: string;
  /** As stored: `createCategory` mints its own key and ignores the one sent,
   * so the spec reads it back rather than assuming — which is what the editor
   * does too, and what makes the comparison meaningful. */
  let categorySourceId: string;
  let productSlug: string;
  let tierId: string;
  /** The product as the editor last read it — what a save carries back. */
  let stored: Record<string, unknown>;

  const asAdmin = (
    method: 'get' | 'put' | 'patch' | 'post' | 'delete',
    url: string,
    data?: unknown,
  ) =>
    axios.request({
      method,
      url,
      data,
      headers: { Cookie: adminCookie },
      validateStatus: () => true,
    });

  const setOwned = async (owned: boolean) => {
    const res = await asAdmin('put', '/settings/ownership', {
      area: 'catalog',
      owned,
    });
    expect(res.status).toBe(200);
    return res.data;
  };

  /** Runs `body` with the catalog handed over, and always hands it back. */
  const whileOwned = async (body: () => Promise<void>) => {
    await setOwned(true);
    try {
      await body();
    } finally {
      await setOwned(false);
    }
  };

  /** A whole-product save that carries the stored values back unchanged. */
  const saveUnchanged = (over: Record<string, unknown> = {}) =>
    asAdmin('put', `/admin/catalog/products/${productSlug}`, {
      name: stored['name'],
      slug: productSlug,
      priceMinor: stored['priceMinor'],
      categoryId: stored['categoryId'],
      descriptionHtml: stored['descriptionHtml'],
      attributes: [],
      images: [],
      tierPrices: [],
      priceBasisPieces: stored['priceBasisPieces'],
      piecesPerPack: stored['piecesPerPack'],
      packsPerBox: stored['packsPerBox'],
      minPieceQty: stored['minPieceQty'],
      boxVolume: stored['boxVolume'],
      boxWeight: stored['boxWeight'],
      boxCount: stored['boxCount'],
      lineNoteEnabled: stored['lineNoteEnabled'],
      lineNotePrompt: stored['lineNotePrompt'],
      stockPieces: stored['stockPieces'],
      lowStockThresholdPieces: stored['lowStockThresholdPieces'],
      pairedSlugs: [],
      documentIds: [],
      ...over,
    });

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    for (const [email, role] of [
      [ADMIN_EMAIL, 'admin'],
      [MANAGER_EMAIL, 'manager'],
    ]) {
      await client.query('DELETE FROM users WHERE email = $1', [email]);
      await client.query(
        `INSERT INTO users (email, "passwordHash", role, status)
         VALUES ($1, $2, $3, 'active')`,
        [email, await hash(PASSWORD), role],
      );
    }
    const login = async (email: string) =>
      sessionCookie(
        (await axios.post('/auth/login', { email, password: PASSWORD }))
          .headers['set-cookie'],
      );
    adminCookie = await login(ADMIN_EMAIL);
    managerCookie = await login(MANAGER_EMAIL);

    // Nothing may be owned on the way in: a previous crashed run must not
    // decide what this one sees.
    await setOwned(false);

    const category = await asAdmin('post', '/admin/catalog/categories', {
      name: CATEGORY_NAME,
      sourceId: CATEGORY_SOURCE_ID,
      shortName: null,
      parentId: null,
      image: null,
      description: null,
    });
    expect(category.status).toBe(201);
    categoryId = category.data.id;
    categorySourceId = category.data.sourceId;

    const product = await asAdmin('post', '/admin/catalog/products', {
      name: PRODUCT_NAME,
      priceMinor: 1500,
      categoryId,
      sourceId: PRODUCT_SOURCE_ID,
      descriptionHtml: '',
      attributes: [],
      images: [],
      tierPrices: [],
      stockPieces: 12,
    });
    expect(product.status).toBe(201);
    stored = product.data;
    productSlug = product.data.slug;

    const tier = await asAdmin('post', '/admin/tiers', {
      label: TIER_LABEL,
      key: TIER_KEY,
    });
    expect(tier.status).toBe(201);
    tierId = tier.data.id;

    const issued = await asAdmin('post', '/admin/api-tokens', {
      name: TOKEN_NAME,
      scopes: ['catalog-sync'],
    });
    token = issued.data.token;
  });

  afterAll(async () => {
    // Whatever went wrong above, the shared switch goes back off.
    await asAdmin('put', '/settings/ownership', {
      area: 'catalog',
      owned: false,
    });
    await client.query('DELETE FROM sync_runs WHERE "tokenName" LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    await client.query('DELETE FROM api_tokens WHERE name LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    await client.query('DELETE FROM products WHERE "sourceId" = $1', [
      PRODUCT_SOURCE_ID,
    ]);
    await client.query('DELETE FROM customer_tiers WHERE key LIKE $1', [
      `${TIER_KEY}%`,
    ]);
    await client.query('DELETE FROM categories WHERE name LIKE $1', [
      `${CATEGORY_NAME}%`,
    ]);
    await client.query(
      'DELETE FROM setting_changes WHERE "changedByEmail" = $1',
      [ADMIN_EMAIL],
    );
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL],
    ]);
    await client.end();
  });

  describe('the switch itself', () => {
    it('is admin-only', async () => {
      const res = await axios.put(
        '/settings/ownership',
        { area: 'catalog', owned: true },
        { headers: { Cookie: managerCookie }, validateStatus: () => true },
      );
      expect(res.status).toBe(403);
    });

    it('refuses an area nobody wrote a guard for', async () => {
      const res = await asAdmin('put', '/settings/ownership', {
        area: 'everything',
        owned: true,
      });
      expect(res.status).toBe(400);
    });

    it('reports what it was set to, and records who set it', async () => {
      await whileOwned(async () => {
        const status = await asAdmin('get', '/settings');
        expect(status.data.ownedAreas).toEqual(['catalog']);

        const history = await asAdmin('get', '/settings/changes');
        expect(history.data.changes[0]).toMatchObject({
          kind: 'ownership',
          area: 'catalog',
          enabled: true,
          actorEmail: ADMIN_EMAIL,
        });
      });
    });
  });

  describe('while the catalog is externally owned', () => {
    it('accepts a save that carries the owned fields back unchanged', async () => {
      // The whole shape of the rule: the contract takes a whole product, so a
      // save always carries name, price and stock. Only a *change* is a write.
      await whileOwned(async () => {
        const res = await saveUnchanged({
          descriptionHtml: '<p>Edited while the exchange holds the rest.</p>',
        });
        expect(res.status).toBe(200);
        expect(res.data.descriptionHtml).toContain('Edited while');
      });
    });

    it('refuses a save that moves one of the owned fields', async () => {
      await whileOwned(async () => {
        const res = await saveUnchanged({ priceMinor: 9999 });
        expect(res.status).toBe(409);
        expect(res.data.code).toBe('catalog-externally-owned');
      });

      const { rows } = await client.query(
        'SELECT "defaultPriceMinor" FROM products WHERE "sourceId" = $1',
        [PRODUCT_SOURCE_ID],
      );
      expect(rows[0].defaultPriceMinor).toBe(1500);
    });

    it('refuses a re-keying, which would orphan the row', async () => {
      await whileOwned(async () => {
        const res = await saveUnchanged({ sourceId: `${PRODUCT_SOURCE_ID}-x` });
        expect(res.status).toBe(409);
        expect(res.data.code).toBe('catalog-externally-owned');
      });
    });

    it('refuses creating, deleting and restoring a product', async () => {
      await whileOwned(async () => {
        const created = await asAdmin('post', '/admin/catalog/products', {
          name: `${PRODUCT_NAME} second`,
          priceMinor: 100,
          categoryId,
          descriptionHtml: '',
          attributes: [],
          images: [],
          tierPrices: [],
        });
        expect(created.status).toBe(409);
        expect(created.data.code).toBe('catalog-externally-owned');

        const deleted = await asAdmin(
          'delete',
          `/admin/catalog/products/${productSlug}`,
        );
        expect(deleted.status).toBe(409);

        const restored = await asAdmin(
          'post',
          `/admin/catalog/products/${productSlug}/restore`,
        );
        expect(restored.status).toBe(409);
      });
    });

    it('still lets the shop publish and unpublish', async () => {
      // What the shop shows is not what it stocks, so publication stays the
      // shop's throughout.
      await whileOwned(async () => {
        const res = await asAdmin(
          'patch',
          `/admin/catalog/products/${productSlug}/published`,
          { published: true },
        );
        expect(res.status).toBe(200);
        expect(res.data.publishedAt).not.toBeNull();
      });
    });

    it('refuses renaming a category but not restyling it', async () => {
      await whileOwned(async () => {
        const base = {
          shortName: null,
          parentId: null,
          image: null,
          description: null,
          sourceId: categorySourceId,
        };
        const renamed = await asAdmin(
          'put',
          `/admin/catalog/categories/${categoryId}`,
          { ...base, name: `${CATEGORY_NAME} renamed` },
        );
        expect(renamed.status).toBe(409);
        expect(renamed.data.code).toBe('catalog-externally-owned');

        // The presentation overlay is the shop's, which is what keeps the tree
        // rearrangeable while the exchange owns what hangs in it.
        const restyled = await asAdmin(
          'put',
          `/admin/catalog/categories/${categoryId}`,
          { ...base, name: CATEGORY_NAME, shortName: 'Nickname' },
        );
        expect(restyled.status).toBe(200);
        expect(restyled.data.shortName).toBe('Nickname');
      });
    });

    it('refuses a delete that would reassign products to another category', async () => {
      await whileOwned(async () => {
        const other = await asAdmin('post', '/admin/catalog/categories', {
          name: `${CATEGORY_NAME} spare`,
          shortName: null,
          parentId: null,
          image: null,
          description: null,
        });
        // Creating a category stays open: the shop still arranges the tree.
        expect(other.status).toBe(201);

        const res = await asAdmin(
          'delete',
          `/admin/catalog/categories/${categoryId}?reassignTo=${other.data.id}`,
        );
        expect(res.status).toBe(409);
        expect(res.data.code).toBe('catalog-externally-owned');

        // And an empty one still deletes — it writes nothing the exchange owns.
        const emptied = await asAdmin(
          'delete',
          `/admin/catalog/categories/${other.data.id}`,
        );
        expect(emptied.status).toBe(200);
      });
    });

    it('refuses re-keying a price list, but not renaming or replacing one', async () => {
      const created = await asAdmin('post', '/admin/tiers', {
        label: `${TIER_LABEL} spare`,
        key: `${TIER_KEY}-spare`,
      });
      expect(created.status).toBe(201);

      await whileOwned(async () => {
        // The key is the exchange's handle on this list — a `price:<key>`
        // column addresses it, so retyping it points the run at a stranger.
        const rekeyed = await asAdmin('put', `/admin/tiers/${tierId}`, {
          label: TIER_LABEL,
          key: `${TIER_KEY}-moved`,
        });
        expect(rekeyed.status).toBe(409);
        expect(rekeyed.data.code).toBe('catalog-externally-owned');

        // The label is what staff read and no run carries it.
        const renamed = await asAdmin('put', `/admin/tiers/${tierId}`, {
          label: `${TIER_LABEL} renamed`,
          key: TIER_KEY,
        });
        expect(renamed.status).toBe(200);
        expect(renamed.data.label).toBe(`${TIER_LABEL} renamed`);

        // Adding a list stays open: it is how an admin answers a run that
        // priced a key this deployment does not have, without handing the
        // catalog back first. Dropping an unused one stays open with it.
        const added = await asAdmin('post', '/admin/tiers', {
          label: `${TIER_LABEL} added`,
          key: `${TIER_KEY}-added`,
        });
        expect(added.status).toBe(201);
        const dropped = await asAdmin(
          'delete',
          `/admin/tiers/${created.data.id}`,
        );
        expect(dropped.status).toBe(200);
      });

      await asAdmin('put', `/admin/tiers/${tierId}`, {
        label: TIER_LABEL,
        key: TIER_KEY,
      });
    });

    it('refuses the manual upload', async () => {
      await whileOwned(async () => {
        const form = new FormData();
        form.append(
          'file',
          new Blob([`sourceId,name\n${PRODUCT_SOURCE_ID},Renamed\n`], {
            type: 'text/csv',
          }),
          'catalog.csv',
        );
        const res = await axios.post('/admin/sync/preview', form, {
          headers: { Cookie: adminCookie },
          validateStatus: () => true,
        });
        expect(res.status).toBe(409);
        expect(res.data.code).toBe('catalog-externally-owned');
      });
    });

    it('accepts a machine run, which is the point of handing it over', async () => {
      await whileOwned(async () => {
        const res = await axios.post(
          '/machine/sync/runs',
          {
            rows: [{ sourceId: PRODUCT_SOURCE_ID, prices: { default: 1600 } }],
            label: `${TOKEN_NAME} run`,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: () => true,
          },
        );
        expect(res.status).toBe(201);
        expect(res.data.run.status).toBe('applied');
      });

      // Reset for the specs that follow, and prove the write landed.
      const { rows } = await client.query(
        'SELECT "defaultPriceMinor" FROM products WHERE "sourceId" = $1',
        [PRODUCT_SOURCE_ID],
      );
      expect(rows[0].defaultPriceMinor).toBe(1600);
      stored = { ...stored, priceMinor: 1600 };
    });
  });

  describe('while nobody owns the catalog', () => {
    it('refuses a machine submission', async () => {
      const res = await axios.post(
        '/machine/sync/runs',
        { rows: [] },
        {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        },
      );
      expect(res.status).toBe(409);
      expect(res.data.code).toBe('catalog-not-externally-owned');
    });

    it('refuses a machine failure report too', async () => {
      // The token is good; the platform is simply not listening on this area.
      const res = await axios.post(
        '/machine/sync/failures',
        { message: 'could not read the export' },
        {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        },
      );
      expect(res.status).toBe(409);
      expect(res.data.code).toBe('catalog-not-externally-owned');
    });

    it('lets the shop edit its own catalog again', async () => {
      const res = await saveUnchanged({ name: `${PRODUCT_NAME} renamed` });
      expect(res.status).toBe(200);
      expect(res.data.name).toBe(`${PRODUCT_NAME} renamed`);
      stored = res.data;
    });
  });

  describe('a run staged before the switch moved', () => {
    it('cannot be applied afterwards', async () => {
      // Applying is the write, so it is judged by the setting in force now.
      const form = new FormData();
      form.append(
        'file',
        new Blob([`sourceId,name\n${PRODUCT_SOURCE_ID},Later name\n`], {
          type: 'text/csv',
        }),
        'catalog.csv',
      );
      const preview = await axios.post('/admin/sync/preview', form, {
        headers: { Cookie: adminCookie },
        validateStatus: () => true,
      });
      expect(preview.status).toBe(201);
      const runId = preview.data.run.id;

      await whileOwned(async () => {
        const res = await asAdmin(
          'post',
          `/admin/sync/runs/${runId}/commit`,
          {},
        );
        expect(res.status).toBe(409);
        expect(res.data.code).toBe('catalog-externally-owned');
      });

      // And once it is back, the same run applies.
      const applied = await asAdmin(
        'post',
        `/admin/sync/runs/${runId}/commit`,
        {},
      );
      expect(applied.status).toBe(200);
      await client.query('DELETE FROM sync_runs WHERE "actorEmail" = $1', [
        ADMIN_EMAIL,
      ]);
    });
  });
});
