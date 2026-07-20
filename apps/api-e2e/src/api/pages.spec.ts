import { pageSeeds } from '@b2b-catalog-platform/seed';
import axios from 'axios';

describe('GET /pages/:slug', () => {
  it.each(pageSeeds.map((seed) => [seed.slug, seed] as const))(
    'returns the seeded %s page in exactly the contract shape',
    async (slug, seed) => {
      const res = await axios.get(`/pages/${slug}`);

      expect(res.status).toBe(200);
      // toEqual (not toMatchObject) on purpose: also fails if internal DB
      // columns (e.g. the id) ever leak past the response validation.
      expect(res.data).toEqual({
        title: seed.title,
        bodyHtml: seed.bodyHtml,
      });
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
