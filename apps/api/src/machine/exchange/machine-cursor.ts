import { BadRequestException } from '@nestjs/common';

/**
 * The cursor both outbound reads page by: `updatedAt`, then `id`.
 *
 * The timestamp travels as text, selected `::text` and cast back with
 * `::timestamptz`. Postgres keeps microseconds and a JS `Date` milliseconds,
 * so a cursor from the rounded value would re-select the boundary row of
 * every page.
 */
export interface MachineCursor {
  updatedAt: string;
  id: string;
}

/** Opaque, so no client comes to depend on an ordering we may change. */
export function encodeMachineCursor(updatedAt: string, id: string): string {
  return Buffer.from(`${updatedAt}|${id}`).toString('base64url');
}

export function parseMachineCursor(
  cursor: string | undefined,
): MachineCursor | undefined {
  if (!cursor) return undefined;
  const [updatedAt, id, ...rest] = Buffer.from(cursor, 'base64url')
    .toString('utf8')
    .split('|');
  if (
    rest.length > 0 ||
    !id ||
    !updatedAt ||
    Number.isNaN(Date.parse(updatedAt))
  ) {
    // Refused rather than restarted, or the puller re-reads the whole book
    // without knowing why.
    throw new BadRequestException({
      code: 'invalid-cursor',
      message: 'That cursor was not issued by this endpoint',
    });
  }
  return { updatedAt, id };
}
