import { BadRequestException } from '@nestjs/common';
import { encodeMachineCursor, parseMachineCursor } from './machine-cursor';

/**
 * The cursor both outbound reads page by. Worth its own spec because the bug
 * it exists to prevent is invisible in a single page: a timestamp that loses
 * precision on the way out and back re-selects the row it was meant to move
 * past, and only the boundary between two pages ever shows it.
 */
describe('machine cursor', () => {
  it('carries the timestamp back unchanged, to the microsecond', () => {
    // What Postgres hands back as `::text` — six fractional digits, which a JS
    // Date cannot hold.
    const at = '2026-09-18 08:14:22.123456+00';
    const parsed = parseMachineCursor(
      encodeMachineCursor(at, '11111111-1111-4111-8111-111111111111'),
    );

    expect(parsed).toEqual({
      updatedAt: at,
      id: '11111111-1111-4111-8111-111111111111',
    });
  });

  it('reads nothing from no cursor', () => {
    expect(parseMachineCursor(undefined)).toBeUndefined();
  });

  it.each([
    ['not base64 at all', '!!!!'],
    ['one value', Buffer.from('2026-09-18T08:00:00Z').toString('base64url')],
    [
      'a third value',
      Buffer.from('2026-09-18T08:00:00Z|id|extra').toString('base64url'),
    ],
    ['no timestamp', Buffer.from('|id').toString('base64url')],
    [
      'a timestamp that is not one',
      Buffer.from('yesterday|id').toString('base64url'),
    ],
  ])('refuses a cursor it did not issue: %s', (_case, cursor) => {
    // Refused rather than ignored: a puller handed a cursor from somewhere
    // else would otherwise silently re-read the whole book.
    expect(() => parseMachineCursor(cursor)).toThrow(BadRequestException);
    try {
      parseMachineCursor(cursor);
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'invalid-cursor',
      });
    }
  });
});
