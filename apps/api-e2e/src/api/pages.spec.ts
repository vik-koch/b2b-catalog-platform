import { aboutPageSeed } from '@b2b-catalog-platform/seed';
import axios from 'axios';

describe('GET /pages/:slug', () => {
  it('returns the seeded page in exactly the contract shape', async () => {
    const res = await axios.get('/pages/about');

    expect(res.status).toBe(200);
    // toEqual (not toMatchObject) on purpose: also fails if internal DB
    // columns (e.g. the id) ever leak past the response validation.
    expect(res.data).toEqual({
      title: aboutPageSeed.title,
      bodyHtml: aboutPageSeed.bodyHtml,
    });
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await axios.get('/pages/does-not-exist', {
      validateStatus: () => true,
    });

    expect(res.status).toBe(404);
    expect(res.data).toEqual({ message: 'Page not found' });
  });
});
