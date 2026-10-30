import { ConflictException } from '@nestjs/common';
import { runUnique } from './catalog-identity';

/** A unique violation as drizzle throws it: the driver's error on `cause`. */
const wrapped = (code: string) =>
  new Error('Failed query', { cause: { code } });

describe('runUnique', () => {
  it('answers a race past the pre-checks with the declared conflict', async () => {
    const result = runUnique(() => Promise.reject(wrapped('23505')));

    await expect(result).rejects.toBeInstanceOf(ConflictException);
    await expect(result).rejects.toMatchObject({
      response: { code: 'slug-or-source-id-taken' },
    });
  });

  it('lets any other failure through', async () => {
    const error = wrapped('23503');

    await expect(runUnique(() => Promise.reject(error))).rejects.toBe(error);
  });

  it('hands back what the write returned', async () => {
    await expect(runUnique(async () => 'saved')).resolves.toBe('saved');
  });
});
