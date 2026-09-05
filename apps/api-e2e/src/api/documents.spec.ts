import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Client } from 'pg';
import sharp from 'sharp';
import { requireEnv } from '../support/env';

/**
 * Product documents (FR-DOC-01) — the upload pipeline and the row's CRUD.
 *
 * Against the real store and database on purpose: the one thing this feature
 * promises is that a certificate comes back byte-identical, which is only
 * provable by reading the file back off the volume.
 */

// The LocalMediaStore writes documents to <workspace>/.media/documents.
const DOCUMENT_DIR = join(__dirname, '../../../..', '.media', 'documents');
const storedBytes = (url: string): Promise<Buffer> =>
  readFile(join(DOCUMENT_DIR, basename(url)));

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
  const createdIds: string[] = [];

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
  });

  afterAll(async () => {
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
});
