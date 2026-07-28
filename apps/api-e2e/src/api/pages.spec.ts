import { hash } from '@node-rs/argon2';
import { pageSeeds, seedPages } from '@b2b-catalog-platform/seed';
import { PAGE_BODY_MAX_LENGTH } from '@b2b-catalog-platform/shared';
import { sanitizeRichText } from '@b2b-catalog-platform/shared/node';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

const ADMIN_EMAIL = 'e2e-pages-admin@example.com';
const MANAGER_EMAIL = 'e2e-pages-manager@example.com';
const PASSWORD = 'e2e-pages-password';

// Seeded content is already clean, but assert against the sanitized form: the
// seed writes through the sanitizer, so that is what the column holds.
const seededBody = (bodyHtml: string) => sanitizeRichText(bodyHtml);

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

describe('GET /pages/:slug', () => {
  it.each(pageSeeds.map((seed) => [seed.slug, seed] as const))(
    'returns the seeded %s page in exactly the contract shape',
    async (slug, seed) => {
      const res = await axios.get(`/pages/${slug}`);

      expect(res.status).toBe(200);
      // toEqual (not toMatchObject) on purpose: also fails if internal DB
      // columns (the id, and the updatedBy audit column) ever leak past the
      // response validation.
      expect(res.data).toEqual({
        title: seed.title,
        bodyHtml: seededBody(seed.bodyHtml),
        updatedAt: expect.any(String),
      });
      expect(Date.parse(res.data.updatedAt)).not.toBeNaN();
    },
  );

  it('returns 404 for an unknown slug', async () => {
    const res = await axios.get('/pages/does-not-exist', {
      validateStatus: () => true,
    });

    expect(res.status).toBe(404);
    expect(res.data).toEqual({ message: 'Page not found' });
  });
});

describe('PUT /pages/:slug (FR-ADM-03)', () => {
  const slug = 'about';
  let client: Client;
  let adminCookie: string;
  let adminId: string;

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
    const { rows } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [ADMIN_EMAIL],
    );
    adminId = rows[0].id;
    adminCookie = await loginAs(ADMIN_EMAIL);
  });

  // Every edit mutates shared state, so restore the seeded content afterwards
  // and leave no test users behind.
  afterEach(async () => {
    await seedPages(client);
    await client.query('UPDATE pages SET "updatedBy" = NULL');
  });

  afterAll(async () => {
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL],
    ]);
    await client.end();
  });

  const put = (body: unknown, cookie?: string) =>
    axios.put(`/pages/${slug}`, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });

  it('saves a new title and body, and reflects them on the public read', async () => {
    const res = await put(
      {
        title: 'About the roastery',
        bodyHtml: '<p>New <strong>copy</strong>.</p>',
      },
      adminCookie,
    );

    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      title: 'About the roastery',
      bodyHtml: '<p>New <strong>copy</strong>.</p>',
      updatedAt: expect.any(String),
    });

    const read = await axios.get(`/pages/${slug}`);
    expect(read.data.bodyHtml).toBe('<p>New <strong>copy</strong>.</p>');
  });

  it('stores the body sanitized, not merely renders it so', async () => {
    const res = await put(
      {
        title: 'About',
        bodyHtml: '<p onclick="steal()">Text</p><script>alert(1)</script>',
      },
      adminCookie,
    );

    expect(res.status).toBe(200);
    expect(res.data.bodyHtml).toBe('<p>Text</p>');

    // The column itself is clean, not just the response.
    const { rows } = await client.query(
      'SELECT "bodyHtml" FROM pages WHERE id = $1',
      [slug],
    );
    expect(rows[0].bodyHtml).toBe('<p>Text</p>');
  });

  it('records who edited the page', async () => {
    await put({ title: 'About', bodyHtml: '<p>x</p>' }, adminCookie);

    const { rows } = await client.query(
      'SELECT "updatedBy" FROM pages WHERE id = $1',
      [slug],
    );
    expect(rows[0].updatedBy).toBe(adminId);
  });

  it('advances updatedAt', async () => {
    const before = await axios.get(`/pages/${slug}`);
    const res = await put(
      { title: 'About', bodyHtml: '<p>x</p>' },
      adminCookie,
    );

    expect(Date.parse(res.data.updatedAt)).toBeGreaterThan(
      Date.parse(before.data.updatedAt),
    );
  });

  it('accepts an emptied body', async () => {
    const res = await put({ title: 'About', bodyHtml: '' }, adminCookie);

    expect(res.status).toBe(200);
    expect(res.data.bodyHtml).toBe('');
  });

  it('rejects an anonymous edit with 401 and leaves the page untouched', async () => {
    const res = await put({ title: 'Hijacked', bodyHtml: '<p>x</p>' });

    expect(res.status).toBe(401);
    const read = await axios.get(`/pages/${slug}`);
    expect(read.data.title).not.toBe('Hijacked');
  });

  it('rejects a manager with 403 — site text is admin-only', async () => {
    const res = await put(
      { title: 'Hijacked', bodyHtml: '<p>x</p>' },
      await loginAs(MANAGER_EMAIL),
    );

    expect(res.status).toBe(403);
  });

  it('rejects an unknown slug with 400 — pages cannot be created', async () => {
    const res = await axios.put(
      '/pages/brand-new-page',
      { title: 'New', bodyHtml: '<p>x</p>' },
      { headers: { Cookie: adminCookie }, validateStatus: () => true },
    );

    expect(res.status).toBe(400);
    const { rows } = await client.query(
      'SELECT COUNT(*)::int AS count FROM pages WHERE id = $1',
      ['brand-new-page'],
    );
    expect(rows[0].count).toBe(0);
  });

  it('rejects an empty title', async () => {
    const res = await put({ title: '   ', bodyHtml: '<p>x</p>' }, adminCookie);

    expect(res.status).toBe(400);
  });

  it('rejects a body over the size cap with a 400, not a body-parser 413', async () => {
    // Just over PAGE_BODY_MAX_LENGTH and still well under Express's 100 KB
    // body limit, so this proves the contract cap is the one that fires.
    const oversized = '<p>x</p>'.repeat(PAGE_BODY_MAX_LENGTH / 8 + 100);
    expect(oversized.length).toBeGreaterThan(PAGE_BODY_MAX_LENGTH);

    const res = await put({ title: 'About', bodyHtml: oversized }, adminCookie);

    expect(res.status).toBe(400);
  });
});
