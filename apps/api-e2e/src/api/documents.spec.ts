import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Client } from 'pg';
import sharp from 'sharp';
import { requireEnv } from '../support/env';

/**
 * Product documents (FR-DOC-01/02) — the upload pipeline, the row's CRUD and
 * the links to the products a document is shown on.
 *
 * Against the real store and database on purpose: the one thing this feature
 * promises is that a certificate comes back byte-identical, which is only
 * provable by reading the file back off the volume.
 */

// The LocalMediaStore writes documents to <workspace>/.media/documents.
const DOCUMENT_DIR = join(__dirname, '../../../..', '.media', 'documents');
const storedBytes = (url: string): Promise<Buffer> =>
  readFile(join(DOCUMENT_DIR, basename(url)));

// Per-run suffix, so leftovers from a crashed run cannot collide.
const R = Date.now().toString(36);

const ADMIN_EMAIL = 'e2e-documents-admin@example.com';
const MANAGER_EMAIL = 'e2e-documents-manager@example.com';
const PASSWORD = 'e2e-documents-password';

async function loginAs(email: string): Promise<string> {
  const res = await axios.post('/auth/login', { email, password: PASSWORD });
  const cookie = (res.headers['set-cookie'] as string[] | undefined)
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error(`login failed for ${email}`);
  return cookie;
}

/** A minimal but real PDF: the signature, some body, and the trailer. */
function pdf(note: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% ${note}\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
  );
}

function form(bytes: Buffer, name: string, type: string): FormData {
  const data = new FormData();
  data.append('file', new Blob([new Uint8Array(bytes)], { type }), name);
  return data;
}

describe('Product documents (FR-DOC-01)', () => {
  let client: Client;
  let adminCookie = '';
  let managerCookie = '';
  let categoryId = '';
  const createdIds: string[] = [];
  const createdProductSlugs: string[] = [];

  const upload = (data: FormData | undefined, cookie = adminCookie) =>
    axios.post('/media/document', data, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const get = (url: string, cookie = adminCookie) =>
    axios.get(url, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const post = (url: string, body: unknown, cookie = adminCookie) =>
    axios.post(url, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const put = (url: string, body: unknown, cookie = adminCookie) =>
    axios.put(url, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const patch = (url: string, body: unknown, cookie = adminCookie) =>
    axios.patch(url, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const del = (url: string, cookie = adminCookie) =>
    axios.delete(url, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });

  /** Uploads a file and returns the stored-file object a save carries. */
  async function uploadPdf(note: string, name = 'certificate.pdf') {
    const res = await upload(form(pdf(note), name, 'application/pdf'));
    expect(res.status).toBe(201);
    return res.data;
  }

  async function createDocument(body: Record<string, unknown>) {
    const res = await post('/admin/documents', body);
    if (res.status === 201) createdIds.push(res.data.id);
    return res;
  }

  /**
   * The fields a product update has to send back unchanged. The editor sends
   * the whole record; a test that only wants to change the documents still has
   * to, so this narrows a read to what the write shape accepts.
   */
  function productBody(product: Record<string, unknown>) {
    return {
      name: product.name,
      priceMinor: product.priceMinor,
      categoryId: product.categoryId,
      descriptionHtml: product.descriptionHtml,
      attributes: product.attributes,
      images: product.images,
      tierPrices: product.tierPrices,
      priceBasisPieces: product.priceBasisPieces,
      piecesPerPack: product.piecesPerPack,
      packsPerBox: product.packsPerBox,
      minPieceQty: product.minPieceQty,
      boxVolume: product.boxVolume,
      boxWeight: product.boxWeight,
      boxCount: product.boxCount,
      lineNoteEnabled: product.lineNoteEnabled,
      lineNotePrompt: product.lineNotePrompt,
      stockPieces: product.stockPieces,
      lowStockThresholdPieces: product.lowStockThresholdPieces,
    };
  }

  /** A product to hang a document on, tracked for cleanup. */
  async function createProduct(name: string): Promise<string> {
    const res = await post('/admin/catalog/products', {
      name: `${name} ${R}`,
      priceMinor: 1234,
      categoryId,
    });
    expect(res.status).toBe(201);
    createdProductSlugs.push(res.data.slug);
    return res.data.slug;
  }

  /** Onto the storefront: a created product is unpublished until it is. */
  async function publishProduct(slug: string): Promise<void> {
    const res = await patch(`/admin/catalog/products/${slug}/published`, {
      published: true,
    });
    expect(res.status).toBe(200);
  }

  /** An ISO day `days` from today — the expiry states are relative to now. */
  function day(days: number): string {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

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

    const { rows } = await client.query<{ id: string }>(
      'SELECT id FROM categories WHERE slug = $1',
      ['cleaning'],
    );
    categoryId = rows[0].id;
  });

  afterAll(async () => {
    for (const slug of createdProductSlugs) {
      await client.query('DELETE FROM products WHERE slug = $1', [slug]);
    }
    if (createdIds.length) {
      await client.query('DELETE FROM documents WHERE id = ANY($1)', [
        createdIds,
      ]);
    }
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL],
    ]);
    await client.end();
  });

  describe('POST /media/document', () => {
    it('stores a PDF unmodified under /documents and describes it back', async () => {
      const bytes = pdf('stored unmodified');
      const res = await upload(form(bytes, 'analysis.pdf', 'application/pdf'));

      expect(res.status).toBe(201);
      expect(res.data).toEqual({
        url: expect.stringMatching(/^\/documents\/[0-9a-f]{12}\.pdf$/),
        name: 'analysis.pdf',
        contentType: 'application/pdf',
        byteSize: bytes.length,
      });
      // The point of the whole pipeline: byte-identical, not re-encoded.
      expect(await storedBytes(res.data.url)).toEqual(bytes);
    });

    it('accepts an image as a scanned document, unmodified', async () => {
      const bytes = await sharp({
        create: { width: 40, height: 40, channels: 3, background: '#6f4e37' },
      })
        .png()
        .toBuffer();
      const res = await upload(form(bytes, 'scan.png', 'image/png'));

      expect(res.status).toBe(201);
      expect(res.data.url).toMatch(/^\/documents\/[0-9a-f]{12}\.png$/);
      expect(await storedBytes(res.data.url)).toEqual(bytes);
    });

    it('is idempotent: the same bytes yield the same URL', async () => {
      const bytes = pdf('same bytes');
      const first = await upload(form(bytes, 'a.pdf', 'application/pdf'));
      const second = await upload(form(bytes, 'b.pdf', 'application/pdf'));
      expect(first.data.url).toBe(second.data.url);
    });

    it('rejects a file that only claims to be a PDF', async () => {
      const res = await upload(
        form(Buffer.from('not a pdf at all'), 'x.pdf', 'application/pdf'),
      );
      expect(res.status).toBe(415);
    });

    it('rejects an SVG by content, like the image upload does', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
      );
      const res = await upload(form(svg, 'logo.png', 'image/png'));
      expect(res.status).toBe(415);
    });

    it('rejects a request with no file', async () => {
      const res = await upload(new FormData());
      expect(res.status).toBe(400);
    });

    it('refuses an unauthenticated and a non-admin upload', async () => {
      const bytes = pdf('guarded');
      expect(
        (await upload(form(bytes, 'x.pdf', 'application/pdf'), '')).status,
      ).toBe(401);
      expect(
        (await upload(form(bytes, 'x.pdf', 'application/pdf'), managerCookie))
          .status,
      ).toBe(403);
    });
  });

  describe('/admin/documents', () => {
    it('creates a document from an uploaded file and lists it', async () => {
      const file = await uploadPdf('created');
      const created = await createDocument({
        title: 'Certificate of analysis',
        file,
        issuedAt: '2026-01-15',
        expiresAt: '2027-01-15',
      });

      expect(created.status).toBe(201);
      expect(created.data).toMatchObject({
        title: 'Certificate of analysis',
        file,
        issuedAt: '2026-01-15',
        expiresAt: '2027-01-15',
      });

      const list = await get('/admin/documents');
      expect(list.status).toBe(200);
      expect(list.data.documents.map((d: { id: string }) => d.id)).toContain(
        created.data.id,
      );
    });

    it('keeps both dates optional', async () => {
      const created = await createDocument({
        title: 'Data sheet',
        file: await uploadPdf('no dates', 'sheet.pdf'),
      });
      expect(created.status).toBe(201);
      expect(created.data.issuedAt).toBeNull();
      expect(created.data.expiresAt).toBeNull();
    });

    it('refuses an expiry earlier than the issue date', async () => {
      const res = await createDocument({
        title: 'Backwards',
        file: await uploadPdf('backwards'),
        issuedAt: '2026-05-01',
        expiresAt: '2026-04-01',
      });
      expect(res.status).toBe(400);
    });

    it('replaces the file in place, keeping the row and its id', async () => {
      const created = await createDocument({
        title: 'Renewable certificate',
        file: await uploadPdf('first issue'),
        expiresAt: '2026-06-30',
      });
      const replacement = await uploadPdf('re-issued');

      const updated = await put(`/admin/documents/${created.data.id}`, {
        title: 'Renewable certificate',
        file: replacement,
        expiresAt: '2027-06-30',
      });

      expect(updated.status).toBe(200);
      expect(updated.data.id).toBe(created.data.id);
      expect(updated.data.file.url).toBe(replacement.url);
      expect(updated.data.file.url).not.toBe(created.data.file.url);
      expect(updated.data.expiresAt).toBe('2027-06-30');
    });

    it('answers a missing document with its own code', async () => {
      const missing = '00000000-0000-4000-8000-000000000000';
      const res = await get(`/admin/documents/${missing}`);
      expect(res.status).toBe(404);
      expect(res.data.code).toBe('document-not-found');
    });

    it('deletes a document', async () => {
      const created = await createDocument({
        title: 'Temporary',
        file: await uploadPdf('temporary'),
      });
      expect((await del(`/admin/documents/${created.data.id}`)).status).toBe(
        200,
      );
      expect((await get(`/admin/documents/${created.data.id}`)).status).toBe(
        404,
      );
    });

    it('is admin-only throughout', async () => {
      expect((await get('/admin/documents', '')).status).toBe(401);
      expect((await get('/admin/documents', managerCookie)).status).toBe(403);
    });
  });

  describe('product links (FR-DOC-02)', () => {
    it('links products on create and counts them on the list row', async () => {
      const one = await createProduct('Linked One');
      const other = await createProduct('Linked Two');

      const created = await createDocument({
        title: `Linked certificate ${R}`,
        file: await uploadPdf('linked'),
        productSlugs: [one, other],
      });

      expect(created.status).toBe(201);
      expect(created.data.productCount).toBe(2);
      expect(
        created.data.products.map((p: { slug: string }) => p.slug).sort(),
      ).toEqual([one, other].sort());

      const list = await get('/admin/documents');
      const row = list.data.documents.find(
        (d: { id: string }) => d.id === created.data.id,
      );
      expect(row.productCount).toBe(2);
      // The list stays light: the products themselves are the detail's.
      expect(row.products).toBeUndefined();
    });

    it('replaces the whole set on save, in both directions', async () => {
      const one = await createProduct('Replaced One');
      const other = await createProduct('Replaced Two');
      const created = await createDocument({
        title: `Replaced certificate ${R}`,
        file: await uploadPdf('replaced'),
        productSlugs: [one],
      });

      const updated = await put(`/admin/documents/${created.data.id}`, {
        title: `Replaced certificate ${R}`,
        file: created.data.file,
        productSlugs: [other],
      });

      expect(updated.status).toBe(200);
      expect(
        updated.data.products.map((p: { slug: string }) => p.slug),
      ).toEqual([other]);

      const cleared = await put(`/admin/documents/${created.data.id}`, {
        title: `Replaced certificate ${R}`,
        file: created.data.file,
        productSlugs: [],
      });
      expect(cleared.data.products).toEqual([]);
      expect(cleared.data.productCount).toBe(0);
    });

    it('answers an unknown product slug with its own code', async () => {
      const res = await createDocument({
        title: `Unknown product ${R}`,
        file: await uploadPdf('unknown product'),
        productSlugs: ['no-such-product-at-all'],
      });

      expect(res.status).toBe(404);
      expect(res.data.code).toBe('document-product-not-found');
    });

    it("carries a product's documents in the product's own payload", async () => {
      const slug = await createProduct('Documented');
      const mine = await createDocument({
        title: `Product-scoped ${R}`,
        file: await uploadPdf('product scoped'),
        productSlugs: [slug],
      });
      await createDocument({
        title: `Unrelated ${R}`,
        file: await uploadPdf('unrelated'),
      });

      const res = await get(`/admin/catalog/products/${slug}`);

      expect(res.status).toBe(200);
      expect(res.data.documents).toEqual([
        { id: mine.data.id, title: `Product-scoped ${R}`, expiresAt: null },
      ]);
    });

    it('edits the links from the product side too, without touching the others', async () => {
      const mine = await createProduct('Product side');
      const other = await createProduct('Left alone');
      const document = await createDocument({
        title: `Two-sided ${R}`,
        file: await uploadPdf('two sided'),
        productSlugs: [mine, other],
      });

      // The product save sends the whole set *from its side* — here, none.
      const product = await get(`/admin/catalog/products/${mine}`);
      const saved = await put(`/admin/catalog/products/${mine}`, {
        ...productBody(product.data),
        documentIds: [],
      });

      expect(saved.status).toBe(200);
      expect(saved.data.documents).toEqual([]);

      // The document keeps the other product: a link names one pair.
      const read = await get(`/admin/documents/${document.data.id}`);
      expect(read.data.products.map((p: { slug: string }) => p.slug)).toEqual([
        other,
      ]);
    });

    it('answers an unknown document id on a product save with its own code', async () => {
      const slug = await createProduct('Bad document');
      const product = await get(`/admin/catalog/products/${slug}`);

      const res = await put(`/admin/catalog/products/${slug}`, {
        ...productBody(product.data),
        documentIds: ['00000000-0000-4000-8000-000000000000'],
      });

      expect(res.status).toBe(404);
      expect(res.data.code).toBe('document-not-found');
    });

    it("narrows the product grid to one document's products", async () => {
      const one = await createProduct('Filtered One');
      const other = await createProduct('Filtered Two');
      const created = await createDocument({
        title: `Filtering certificate ${R}`,
        file: await uploadPdf('filtering'),
        productSlugs: [one],
      });

      const res = await get(
        `/admin/catalog/products?documentId=${created.data.id}`,
      );

      expect(res.status).toBe(200);
      const slugs = res.data.items.map((i: { slug: string }) => i.slug);
      expect(slugs).toContain(one);
      expect(slugs).not.toContain(other);
    });

    it('keeps a link through a soft delete, marked rather than dropped', async () => {
      const slug = await createProduct('Soft deleted');
      const created = await createDocument({
        title: `Survives deletion ${R}`,
        file: await uploadPdf('survives'),
        productSlugs: [slug],
      });

      expect((await del(`/admin/catalog/products/${slug}`)).status).toBe(200);

      const read = await get(`/admin/documents/${created.data.id}`);
      expect(read.data.products).toEqual([
        expect.objectContaining({ slug, deleted: true }),
      ]);
    });

    it('takes its links with it when the document is deleted', async () => {
      const slug = await createProduct('Cascade');
      const created = await createDocument({
        title: `Cascading ${R}`,
        file: await uploadPdf('cascading'),
        productSlugs: [slug],
      });

      await del(`/admin/documents/${created.data.id}`);

      const { rows } = await client.query(
        'SELECT 1 FROM document_products WHERE "documentId" = $1',
        [created.data.id],
      );
      expect(rows).toEqual([]);
    });
  });

  /**
   * What a customer sees (FR-DOC-03). The storefront is the only reader that
   * makes a decision about expiry, and it makes it in the query rather than in
   * the page: a document that has run out is simply not there.
   */
  describe('the product page (FR-DOC-03)', () => {
    it('lists the current documents on the product, soonest expiry first', async () => {
      const slug = await createProduct('Storefront documents');
      await publishProduct(slug);
      await createDocument({
        title: `Later ${R}`,
        file: await uploadPdf('later'),
        expiresAt: day(200),
        productSlugs: [slug],
      });
      await createDocument({
        title: `Sooner ${R}`,
        file: await uploadPdf('sooner'),
        expiresAt: day(10),
        productSlugs: [slug],
      });
      const undated = await createDocument({
        title: `Undated ${R}`,
        file: await uploadPdf('undated'),
        productSlugs: [slug],
      });

      const res = await axios.get(`/catalog/products/${slug}`);

      expect(res.status).toBe(200);
      expect(res.data.documents.map((d: { title: string }) => d.title)).toEqual(
        [`Sooner ${R}`, `Later ${R}`, `Undated ${R}`],
      );
      // The file, and what pressing it costs — nothing about dates.
      expect(res.data.documents[2]).toEqual({
        title: `Undated ${R}`,
        url: undated.data.file.url,
        contentType: 'application/pdf',
        byteSize: undated.data.file.byteSize,
      });
    });

    it('shows no expired document, to anybody', async () => {
      const slug = await createProduct('Expired documents');
      await publishProduct(slug);
      await createDocument({
        title: `Lapsed ${R}`,
        file: await uploadPdf('lapsed'),
        expiresAt: day(-1),
        productSlugs: [slug],
      });

      const res = await axios.get(`/catalog/products/${slug}`);

      expect(res.status).toBe(200);
      expect(res.data.documents).toEqual([]);
    });
  });
});
