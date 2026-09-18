import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { priceProduct } from '../support/catalog-fixture';
import { requireEnv } from '../support/env';
import {
  deleteMatching,
  messageBody,
  messagesMatching,
} from '../support/mailpit';

/**
 * The shop's own paperwork arriving from the system that prints it
 * (FR-ORD-05 as amended, FR-ADM-08).
 *
 * What is worth proving against a real stack is everything the request shape
 * does not say: that the pen is the same one the write-back uses and is
 * refused until somebody hands order processing over, that a file arriving
 * writes **no version** and files **no run**, that the customer is written to
 * only when the exchange says so and never about a version they have not been
 * shown, that the panel's own upload closes at the same moment, and that what
 * the platform was handed is what it hands back, bytes for bytes.
 */

const R = Date.now().toString(36);
const ADMIN_EMAIL = `e2e-order-docs-admin-${R}@example.com`;
const MANAGER_EMAIL = `e2e-order-docs-manager-${R}@example.com`;
const CONTACT_EMAIL = `e2e-order-docs-contact-${R}@example.com`;
const PASSWORD = 'e2e-order-docs-password';
const TOKEN_NAME = `e2e order docs ${R}`;
const SOURCE_PREFIX = `E2E-ORDER-DOCS-${R}`;
const PRODUCT = `${SOURCE_PREFIX}-a`;
const SLUG = `e2e-order-docs-a-${R}`;
const PIECE_MINOR = 250;
const PIECES = 10;
/** Every mail this suite could cause goes to one address, which is what makes
 * the inbox assertions safe beside the other suites (see `mailpit.ts`). */
const INBOX = `to:${CONTACT_EMAIL}`;
/** The document mail alone: placing an order mails the customer too, and its
 * subject carries no reference to tell the two apart by. */
const DOCUMENT_MAIL = `${INBOX} subject:document`;

/** A minimal but genuine PDF: the upload sniffs the bytes rather than trusting
 * what the multipart part calls itself. */
const pdfBytes = (marker: string) =>
  Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n`);

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error('expected a session cookie');
  return cookie;
}

describe('Order documents over the machine endpoint (FR-ORD-05)', () => {
  let client: Client;
  let adminCookie: string;
  let managerCookie: string;
  let token: string;
  let readToken: string;

  const asAdmin = (
    method: 'get' | 'put' | 'post',
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
      areas: ['orders'],
      owned,
    });
    expect(res.status).toBe(200);
  };

  /** The machine's upload: multipart, exactly as the adapter posts it. */
  const supply = (
    reference: string,
    kind: string,
    body: Buffer,
    options: {
      notify?: boolean;
      bearer?: string;
      fileName?: string;
      contentType?: string;
    } = {},
  ) => {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(body)], {
        type: options.contentType ?? 'application/pdf',
      }),
      options.fileName ?? 'invoice.pdf',
    );
    if (options.notify !== undefined) {
      form.append('notify', String(options.notify));
    }
    const bearer = options.bearer ?? token;
    return axios.post(`/machine/orders/${reference}/documents/${kind}`, form, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      validateStatus: () => true,
    });
  };

  const unsupply = (reference: string, kind: string, bearer = token) =>
    axios.delete(`/machine/orders/${reference}/documents/${kind}`, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      validateStatus: () => true,
    });

  const writeBack = (body: unknown) =>
    axios.post('/machine/sync/orders/runs', body, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    });

  const readOrder = (reference: string) =>
    axios.get(`/machine/orders/${reference}`, {
      headers: { Authorization: `Bearer ${readToken}` },
      validateStatus: () => true,
    });

  const staffOrder = (reference: string) =>
    axios.get(`/admin/orders/${reference}`, {
      headers: { Cookie: managerCookie },
      validateStatus: () => true,
    });

  const documentOf = async (reference: string, kind: string) => {
    const res = await staffOrder(reference);
    expect(res.status).toBe(200);
    return (res.data.documents as { kind: string }[]).find(
      (document) => document.kind === kind,
    );
  };

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
        customerNote: null,
        acceptPrivacy: true,
        expectedTotalMinor: PIECE_MINOR * PIECES,
      },
      { validateStatus: () => true },
    );
    expect(res.status).toBe(201);
    return res.data.reference as string;
  };

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
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'admin', 'active'), ($3, $2, 'manager', 'active')`,
      [ADMIN_EMAIL, passwordHash, MANAGER_EMAIL],
    );

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

    const issued = await asAdmin('post', '/admin/api-tokens', {
      name: TOKEN_NAME,
      scopes: ['order-sync'],
    });
    token = issued.data.token;
    const reader = await asAdmin('post', '/admin/api-tokens', {
      name: `${TOKEN_NAME} read`,
      scopes: ['order-read'],
    });
    readToken = reader.data.token;
  });

  afterAll(async () => {
    await asAdmin('put', '/settings/ownership', {
      areas: ['orders'],
      owned: false,
    });
    await deleteMatching(INBOX);
    // Runs first: each points at the credential that submitted it.
    await client.query('DELETE FROM sync_runs WHERE "tokenName" LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    await client.query('DELETE FROM api_tokens WHERE name LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    await client.query(
      `DELETE FROM orders WHERE id IN (
         SELECT r."orderId" FROM order_items i
           JOIN order_revisions r ON r.id = i."revisionId"
          WHERE i."productSourceId" LIKE $1)`,
      [`${SOURCE_PREFIX}%`],
    );
    await client.query('DELETE FROM products WHERE "sourceId" LIKE $1', [
      `${SOURCE_PREFIX}%`,
    ]);
    await client.query('DELETE FROM categories WHERE "sourceId" = $1', [
      SOURCE_PREFIX.toLowerCase(),
    ]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL],
    ]);
    await client.end();
  });

  describe('who may reach it', () => {
    it('refuses a request with no credential', async () => {
      const res = await supply(
        'IRRELEVANT',
        'payment-instructions',
        pdfBytes('x'),
        { bearer: '' },
      );
      expect(res.status).toBe(401);
    });

    /** A document is a statement about an order, so it is the same pen that
     * answers one — and a credential brought up to read orders has neither. */
    it('refuses an order-read token', async () => {
      const res = await supply(
        'IRRELEVANT',
        'payment-instructions',
        pdfBytes('x'),
        { bearer: readToken },
      );
      expect(res.status).toBe(403);
      expect(res.data.code).toBe('insufficient-scope');
    });

    /** The mirror of the refusal the admin panel meets while the area *is*
     * owned: exactly one side files the shop's paperwork. */
    it('refuses while nobody has handed order processing over', async () => {
      const reference = await place();
      const res = await supply(
        reference,
        'payment-instructions',
        pdfBytes('x'),
      );

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('orders-not-externally-owned');
      expect(await unsupply(reference, 'payment-instructions')).toMatchObject({
        status: 409,
        data: { code: 'orders-not-externally-owned' },
      });
    });
  });

  describe('while order processing is externally owned', () => {
    beforeAll(() => setOwned(true));
    afterAll(() => setOwned(false));

    it('files the shop invoice against the order and hands it back unchanged', async () => {
      const reference = await place();
      const bytes = pdfBytes(`invoice ${reference}`);

      const res = await supply(reference, 'payment-instructions', bytes, {
        notify: false,
        fileName: 'Rechnung.pdf',
      });

      expect(res.status).toBe(201);
      expect(res.data).toMatchObject({
        kind: 'payment-instructions',
        source: 'supplied',
        fileName: 'Rechnung.pdf',
        contentType: 'application/pdf',
        byteSize: bytes.length,
        suppliedForRevision: 1,
        notifiedAt: null,
      });

      // Bytes in, the same bytes out: the platform stores what it was handed
      // and never re-draws the shop's own paperwork.
      const served = await axios.get(
        `/order-documents/${reference}/payment-instructions`,
        {
          headers: { Cookie: managerCookie },
          responseType: 'arraybuffer',
          validateStatus: () => true,
        },
      );
      expect(served.status).toBe(200);
      expect(Buffer.from(served.data).equals(bytes)).toBe(true);
    });

    /** The whole reason documents stay outside the write-back (ADR 0051, ADR
     * 0062): a file arriving says nothing new about the order. */
    it('writes no version and files no run', async () => {
      const reference = await place();
      const before = await client.query(
        `SELECT count(*)::int AS n FROM sync_runs WHERE area = 'orders'`,
      );

      await supply(reference, 'payment-instructions', pdfBytes('v'), {
        notify: false,
      });

      const order = await readOrder(reference);
      expect(order.data.revisionNumber).toBe(1);
      const after = await client.query(
        `SELECT count(*)::int AS n FROM sync_runs WHERE area = 'orders'`,
      );
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    /** A second file of the same kind is a reprint, not a second document —
     * and it has never been sent, whatever was said about the one it
     * replaces. */
    it('replaces a file of the same kind, and forgets it was sent', async () => {
      const reference = await place();
      const sent = await supply(
        reference,
        'payment-instructions',
        pdfBytes('first'),
        { notify: true },
      );
      expect(sent.status).toBe(201);
      expect(await documentOf(reference, 'payment-instructions')).toMatchObject(
        { notifiedAt: expect.any(String) },
      );

      const reprint = pdfBytes('second');
      await supply(reference, 'payment-instructions', reprint, {
        notify: false,
        fileName: 'Rechnung-2.pdf',
      });

      const after = await staffOrder(reference);
      const documents = (after.data.documents as { kind: string }[]).filter(
        (document) => document.kind === 'payment-instructions',
      );
      expect(documents).toHaveLength(1);
      expect(documents[0]).toMatchObject({
        fileName: 'Rechnung-2.pdf',
        byteSize: reprint.length,
        notifiedAt: null,
      });
    });

    /** `notify` is the same question the write-back asks, answered the same
     * way: nothing is mailed unless the exchange said to mail it. */
    it('mails the customer with the file attached, only when asked', async () => {
      // Every order in this suite writes to the same person, so what is
      // counted is what arrived during this case rather than what is in the
      // inbox.
      const before = new Set(
        (await messagesMatching(DOCUMENT_MAIL)).map((mail) => mail.ID),
      );
      const since = async () =>
        (await messagesMatching(DOCUMENT_MAIL)).filter(
          (mail) => !before.has(mail.ID),
        );

      const quiet = await place();
      await supply(quiet, 'payment-instructions', pdfBytes('quiet'), {
        notify: false,
      });
      expect(await since()).toHaveLength(0);

      const loud = await place();
      const res = await supply(loud, 'payment-instructions', pdfBytes('loud'), {
        notify: true,
        fileName: 'Rechnung.pdf',
      });
      expect(res.status).toBe(201);

      const mails = await since();
      expect(mails).toHaveLength(1);
      const body = await messageBody(mails[0].ID);
      // The instructions travel *with* the message: a link would make paying
      // an invoice a second trip to the shop.
      expect(body.Attachments.map((a) => a.FileName)).toContain('Rechnung.pdf');
    });

    /**
     * The adapter's ordering rule, enforced rather than documented: supply the
     * file *before* the version that announces it. A version held off the
     * customer's page leaves them behind it, and a mail about a document they
     * cannot open is refused — the file is still filed, which is what lets the
     * exchange put that right by bringing them up to date.
     */
    it('refuses to announce a document the customer page is behind', async () => {
      const reference = await place();
      const moved = await writeBack({
        orders: [
          {
            reference,
            basedOnRevision: 1,
            status: 'approved',
            notify: false,
            showCustomer: false,
          },
        ],
      });
      expect(moved.status).toBe(201);

      const res = await supply(
        reference,
        'payment-instructions',
        pdfBytes('e'),
        { notify: true },
      );

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('customer-behind');
      // Filed all the same: the refusal is about the message, not the file.
      expect(await documentOf(reference, 'payment-instructions')).toMatchObject(
        { source: 'supplied' },
      );
    });

    /** The summary the platform draws is replaced the same way, and comes back
     * when the file goes. */
    it('replaces the generated summary, and restores it on removal', async () => {
      const reference = await place();
      await supply(reference, 'order-summary', pdfBytes('summary'), {
        notify: false,
      });
      expect(await documentOf(reference, 'order-summary')).toMatchObject({
        source: 'supplied',
      });

      expect((await unsupply(reference, 'order-summary')).status).toBe(200);

      expect(await documentOf(reference, 'order-summary')).toMatchObject({
        source: 'generated',
      });
    });

    it('refuses to remove what was never supplied', async () => {
      const reference = await place();
      const res = await unsupply(reference, 'payment-instructions');
      expect(res.status).toBe(409);
      expect(res.data.code).toBe('document-not-supplied');
    });

    /** The panel is the other side of the switch: while the exchange may file
     * documents, staff may not — one writer, whichever act it is. */
    it('closes the admin panel own upload at the same moment', async () => {
      const reference = await place();
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(pdfBytes('staff'))], {
          type: 'application/pdf',
        }),
        'staff.pdf',
      );
      const res = await axios.post(
        `/order-documents/${reference}/payment-instructions`,
        form,
        { headers: { Cookie: managerCookie }, validateStatus: () => true },
      );

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('orders-externally-owned');
    });

    describe('what it refuses to store', () => {
      it('404s an order that does not exist', async () => {
        const res = await supply(
          `${SOURCE_PREFIX}-NOPE`,
          'payment-instructions',
          pdfBytes('x'),
        );
        expect(res.status).toBe(404);
      });

      it('400s a kind the platform does not have', async () => {
        const reference = await place();
        const res = await supply(reference, 'delivery-note', pdfBytes('x'));
        expect(res.status).toBe(400);
      });

      /** The bytes decide, not the part's `Content-Type`: this store is read
       * back out to browsers. */
      it('415s something that is not a document however it is labelled', async () => {
        const reference = await place();
        const res = await supply(
          reference,
          'payment-instructions',
          Buffer.from('this is plainly not a document'),
        );
        expect(res.status).toBe(415);
      });
    });
  });
});
