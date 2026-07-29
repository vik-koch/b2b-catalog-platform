import { hash } from '@node-rs/argon2';
import { seedPages } from '@b2b-catalog-platform/seed';
import {
  MEDIA_CATALOG_FULL_WIDTH,
  MEDIA_CATALOG_THUMB_WIDTH,
} from '@b2b-catalog-platform/shared';
import axios from 'axios';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Client } from 'pg';
import sharp from 'sharp';
import { requireEnv } from '../support/env';

// The LocalMediaStore writes to <workspace>/.media (created by global-setup).
const MEDIA_DIR = join(__dirname, '../../../..', '.media');
const storedWidth = async (mediaUrl: string): Promise<number | undefined> => {
  const bytes = await readFile(join(MEDIA_DIR, basename(mediaUrl)));
  return (await sharp(bytes).metadata()).width;
};

const ADMIN_EMAIL = 'e2e-media-admin@example.com';
const MANAGER_EMAIL = 'e2e-media-manager@example.com';
const PASSWORD = 'e2e-media-password';

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) {
    throw new Error('expected a session cookie');
  }
  return cookie;
}

async function loginAs(email: string): Promise<string> {
  const res = await axios.post('/auth/login', { email, password: PASSWORD });
  return sessionCookie(res.headers['set-cookie']);
}

function form(bytes: Buffer, name: string, type: string): FormData {
  const data = new FormData();
  data.append('file', new Blob([new Uint8Array(bytes)], { type }), name);
  return data;
}

const png = (size = 32): Promise<Buffer> =>
  sharp({
    create: { width: size, height: size, channels: 3, background: '#6f4e37' },
  })
    .png()
    .toBuffer();

const upload = (data: FormData | undefined, cookie?: string) =>
  axios.post('/media', data, {
    headers: cookie ? { Cookie: cookie } : {},
    validateStatus: () => true,
  });

const uploadCatalog = (data: FormData | undefined, cookie?: string) =>
  axios.post('/media/catalog', data, {
    headers: cookie ? { Cookie: cookie } : {},
    validateStatus: () => true,
  });

describe('POST /media (0021)', () => {
  let client: Client;
  let adminCookie: string;
  let managerCookie: string;

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
        `INSERT INTO users (email, "passwordHash", role) VALUES ($1, $2, $3)`,
        [email, passwordHash, role],
      );
    }
    adminCookie = await loginAs(ADMIN_EMAIL);
    managerCookie = await loginAs(MANAGER_EMAIL);
  });

  afterAll(async () => {
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL],
    ]);
    await client.end();
  });

  it('stores an admin upload as a content-hashed WebP and returns its URL', async () => {
    const res = await upload(
      form(await png(), 'logo.png', 'image/png'),
      adminCookie,
    );

    expect(res.status).toBe(201);
    expect(res.data).toEqual({ url: expect.any(String) });
    expect(res.data.url).toMatch(/^\/media\/[0-9a-f]{12}\.webp$/);
  });

  it('is idempotent: the same bytes yield the same URL', async () => {
    const bytes = await png(48);
    const first = await upload(form(bytes, 'a.png', 'image/png'), adminCookie);
    const second = await upload(form(bytes, 'b.png', 'image/png'), adminCookie);

    expect(first.data.url).toBe(second.data.url);
  });

  it('rejects an unauthenticated upload', async () => {
    const res = await upload(form(await png(), 'x.png', 'image/png'));
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin upload', async () => {
    const res = await upload(
      form(await png(), 'x.png', 'image/png'),
      managerCookie,
    );
    expect(res.status).toBe(403);
  });

  it('rejects an SVG by content, not its declared type', async () => {
    // Declared as PNG, actually SVG — sniffing must catch it.
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
    );
    const res = await upload(form(svg, 'logo.png', 'image/png'), adminCookie);
    expect(res.status).toBe(415);
  });

  it('rejects a request with no file', async () => {
    const res = await upload(new FormData(), adminCookie);
    expect(res.status).toBe(400);
  });

  describe('POST /media/catalog (FR-ADM-01)', () => {
    it('returns a full + thumb pair at the catalog profile widths', async () => {
      // A source wider than both profiles so each is actually downscaled.
      const res = await uploadCatalog(
        form(await png(1600), 'product.png', 'image/png'),
        adminCookie,
      );

      expect(res.status).toBe(201);
      expect(res.data).toEqual({
        full: expect.stringMatching(/^\/media\/[0-9a-f]{12}\.webp$/),
        thumb: expect.stringMatching(/^\/media\/[0-9a-f]{12}\.webp$/),
      });
      expect(res.data.full).not.toBe(res.data.thumb);
      expect(await storedWidth(res.data.full)).toBe(MEDIA_CATALOG_FULL_WIDTH);
      expect(await storedWidth(res.data.thumb)).toBe(MEDIA_CATALOG_THUMB_WIDTH);
    });

    it('rejects an unauthenticated catalog upload', async () => {
      const res = await uploadCatalog(form(await png(), 'x.png', 'image/png'));
      expect(res.status).toBe(401);
    });

    it('rejects a non-admin catalog upload', async () => {
      const res = await uploadCatalog(
        form(await png(), 'x.png', 'image/png'),
        managerCookie,
      );
      expect(res.status).toBe(403);
    });

    it('rejects an SVG by content on the catalog endpoint too', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
      );
      const res = await uploadCatalog(
        form(svg, 'logo.png', 'image/png'),
        adminCookie,
      );
      expect(res.status).toBe(415);
    });
  });

  describe('a stored image survives a page save', () => {
    let client2: Client;

    beforeAll(async () => {
      client2 = new Client({ connectionString: requireEnv('DATABASE_URL') });
      await client2.connect();
    });
    afterAll(async () => {
      await seedPages(client2);
      await client2.query('UPDATE pages SET "updatedBy" = NULL');
      await client2.end();
    });

    it('keeps the uploaded /media img through sanitize-on-save', async () => {
      const { url } = (
        await upload(form(await png(), 'about.png', 'image/png'), adminCookie)
      ).data;

      const body = `<p>Intro</p><img src="${url}" alt="Our roastery" data-align="center" data-width="600">`;
      const save = await axios.put(
        '/pages/about',
        { title: 'About', bodyHtml: body },
        { headers: { Cookie: adminCookie }, validateStatus: () => true },
      );

      expect(save.status).toBe(200);
      const stored = save.data.bodyHtml as string;
      expect(stored).toContain(`src="${url}"`);
      expect(stored).toContain('alt="Our roastery"');
      expect(stored).toContain('data-align="center"');
      expect(stored).toContain('width:600px');
    });
  });
});
