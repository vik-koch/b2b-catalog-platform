import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { priceProduct } from '../support/catalog-fixture';
import { requireEnv } from '../support/env';
import { deleteMatching } from '../support/mailpit';

/**
 * Removing a guest order's personal details on the guest's request
 * (NFR-LEGAL-14): an admin's alone, only once the order is finished, never
 * for an account holder's order, and recorded as a destruction naming the
 * order. The retention sweep shares the scrub and is not reachable over HTTP.
 */

const R = Date.now().toString(36);
const ADMIN_EMAIL = `e2e-order-pd-admin-${R}@example.com`;
const MANAGER_EMAIL = `e2e-order-pd-manager-${R}@example.com`;
const CUSTOMER_EMAIL = `e2e-order-pd-customer-${R}@example.com`;
const CONTACT_EMAIL = `e2e-order-pd-contact-${R}@example.com`;
const PASSWORD = 'e2e-order-pd-password';
const SOURCE_PREFIX = `E2E-ORDER-PD-${R}`;
const PRODUCT = `${SOURCE_PREFIX}-a`;
const SLUG = `e2e-order-pd-a-${R}`;
const PIECE_MINOR = 250;
const PIECES = 10;
const INBOX = `to:${CONTACT_EMAIL}`;

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error('expected a session cookie');
  return cookie;
}

describe("Removing a guest order's personal details (NFR-LEGAL-14)", () => {
  let client: Client;
  let adminId: string;
  let customerId: string;
  let adminCookie: string;
  let managerCookie: string;

  const remove = (reference: string, cookie = adminCookie) =>
    axios.delete(`/admin/orders/${reference}/personal-data`, {
      headers: { Cookie: cookie },
      validateStatus: () => true,
    });

  const address = {
    label: null,
    street: 'Hafenstraße 12',
    street2: null,
    postalCode: '20359',
    city: 'Hamburg',
    region: null,
    country: 'DE',
  };

  const place = async () => {
    const res = await axios.post(
      '/orders',
      {
        lines: [{ slug: SLUG, unit: 'pack', pieces: PIECES }],
        contact: {
          name: 'Ada Lovelace',
          email: CONTACT_EMAIL,
          phone: '+49 40 7654321',
        },
        fulfilmentMethod: 'delivery',
        party: { name: 'Kontor GmbH', registrationId: 'DE123456789' },
        deliveryAddress: address,
        pickupLocationKey: null,
        billingAddress: address,
        paymentMethod: 'bank-transfer',
        preferredDate: null,
        customerNote: 'Ring twice, ask for Ada',
        expectedTotalMinor: PIECE_MINOR * PIECES,
      },
      { validateStatus: () => true },
    );
    expect(res.status).toBe(201);
    return res.data.reference as string;
  };

  /** Straight to where the shop is done with it: what the route checks is
   * the order's own status, however it got there. */
  const finish = (reference: string) =>
    client.query(
      `UPDATE orders SET status = 'completed' WHERE reference = $1`,
      [reference],
    );

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    const { rows: categories } = await client.query(
      `INSERT INTO categories ("sourceId", slug, name)
       VALUES ($1, $1, $1) RETURNING id`,
      [SOURCE_PREFIX.toLowerCase()],
    );
    await client.query(
      `INSERT INTO products (
         "sourceId", slug, name, "piecesPerPack", "packsPerBox", "minPieceQty",
         "boxVolume", "boxWeight", "boxCount", "categoryId", "publishedAt")
       VALUES ($1, $2, $3, 10, 4, 10, '0.240', '12.500', 1, $4, now())`,
      [PRODUCT, SLUG, `E2E ${SLUG}`, categories[0].id],
    );
    await priceProduct(client, PRODUCT, PIECE_MINOR);

    const passwordHash = await hash(PASSWORD);
    const { rows } = await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'admin', 'active'), ($3, $2, 'manager', 'active'),
              ($4, $2, 'user', 'active')
       RETURNING id, email`,
      [ADMIN_EMAIL, passwordHash, MANAGER_EMAIL, CUSTOMER_EMAIL],
    );
    const idOf = (email: string) =>
      rows.find((row: { email: string }) => row.email === email).id as string;
    adminId = idOf(ADMIN_EMAIL);
    customerId = idOf(CUSTOMER_EMAIL);

    const admin = await axios.post('/auth/login', {
      email: ADMIN_EMAIL,
      password: PASSWORD,
    });
    adminCookie = sessionCookie(admin.headers['set-cookie']);
    const manager = await axios.post('/auth/login', {
      email: MANAGER_EMAIL,
      password: PASSWORD,
    });
    managerCookie = sessionCookie(manager.headers['set-cookie']);
  });

  afterAll(async () => {
    await deleteMatching(INBOX);
    const { rows } = await client.query(
      `SELECT DISTINCT r."orderId" AS id FROM order_items i
         JOIN order_revisions r ON r.id = i."revisionId"
        WHERE i."productSourceId" LIKE $1`,
      [`${SOURCE_PREFIX}%`],
    );
    const ids = rows.map((row: { id: string }) => row.id);
    await client.query(
      'DELETE FROM destruction_records WHERE "subjectId" = ANY($1)',
      [ids],
    );
    await client.query('DELETE FROM orders WHERE id = ANY($1)', [ids]);
    await client.query('DELETE FROM products WHERE "sourceId" LIKE $1', [
      `${SOURCE_PREFIX}%`,
    ]);
    await client.query('DELETE FROM categories WHERE "sourceId" = $1', [
      SOURCE_PREFIX.toLowerCase(),
    ]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL, CUSTOMER_EMAIL],
    ]);
    await client.end();
  });

  it("is an admin's alone", async () => {
    const reference = await place();
    await finish(reference);

    expect((await remove(reference, managerCookie)).status).toBe(403);
  });

  it('answers an unknown reference with a 404', async () => {
    const res = await remove(`NOPE-${R}`);

    expect(res.status).toBe(404);
    expect(res.data.code).toBe('order-not-found');
  });

  it('refuses an order the shop is still filling', async () => {
    const reference = await place();
    const res = await remove(reference);

    expect(res.status).toBe(409);
    expect(res.data.code).toBe('order-not-finished');
  });

  it("refuses an account holder's order, which goes with the account", async () => {
    const reference = await place();
    await finish(reference);
    await client.query(`UPDATE orders SET "userId" = $1 WHERE reference = $2`, [
      customerId,
      reference,
    ]);
    const res = await remove(reference);

    expect(res.status).toBe(409);
    expect(res.data.code).toBe('order-not-guest');
  });

  describe('on a finished guest order', () => {
    let reference: string;
    let orderId: string;

    beforeAll(async () => {
      reference = await place();
      await finish(reference);
      const { rows } = await client.query(
        'SELECT id FROM orders WHERE reference = $1',
        [reference],
      );
      orderId = rows[0].id;
    });

    it('removes the details and says when', async () => {
      const res = await remove(reference);

      expect(res.status).toBe(200);
      expect(res.data.reference).toBe(reference);
      expect(res.data.personalDataRemovedAt).not.toBeNull();
      expect(res.data.contact.email).toBe('removed@deleted.invalid');
    });

    it('leaves no version carrying them, and keeps the money', async () => {
      const { rows } = await client.query(
        `SELECT "contactName", "contactEmail", "customerNote", "partyName",
                "deliveryStreet", "totalMinor"
           FROM order_revisions WHERE "orderId" = $1`,
        [orderId],
      );

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row).toEqual({
          contactName: '[removed]',
          contactEmail: 'removed@deleted.invalid',
          customerNote: null,
          partyName: '[removed]',
          deliveryStreet: '[removed]',
          totalMinor: PIECE_MINOR * PIECES,
        });
      }
    });

    it('records the destruction under the order, by the admin', async () => {
      const { rows } = await client.query(
        `SELECT subject, categories, reason, "destroyedBy", "destroyedByEmail"
           FROM destruction_records WHERE "subjectId" = $1`,
        [orderId],
      );

      expect(rows).toEqual([
        {
          subject: 'order',
          categories: ['order-details', 'order-documents'],
          reason: 'request',
          destroyedBy: adminId,
          destroyedByEmail: ADMIN_EMAIL,
        },
      ]);
    });

    it('refuses a second removal', async () => {
      const res = await remove(reference);

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('personal-data-removed');
    });
  });
});
