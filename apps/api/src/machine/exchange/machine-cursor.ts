import { BadRequestException } from '@nestjs/common';

/**
 * The cursor the outbound reads page by (FR-ADM-08, FR-ADM-18).
 *
 * Shared because both reads walk the same ordering — "everything that changed
 * since, oldest first, with the row's id breaking the tie" — and a second copy
 * of it would be a second chance to get the precision rule below wrong.
 *
 * The timestamp travels as **text**, start to finish. Postgres stores a
 * `timestamptz` to the microsecond and hands the driver a JS `Date`, whose
 * milliseconds are three digits short of it — so a cursor built from the
 * rounded-down value re-selects the row it was meant to move past, and the
 * boundary row of every page comes back twice. Selecting the column `::text`
 * and casting it back with `::timestamptz` means no timestamp is ever parsed
 * and re-printed in between. The `updatedAt` a client reads stays an ordinary
 * ISO value; only the cursor needs this.
 */
export interface MachineCursor {
  updatedAt: string;
  id: string;
}

/**
 * Base64 rather than the two values in the clear, so a client that would
 * otherwise have parsed it is not quietly depending on an ordering these
 * routes are free to change.
 */
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
    // Said rather than silently restarted from the top: a puller handed a
    // cursor these routes did not issue would otherwise re-read the whole
    // book and never find out why.
    throw new BadRequestException({
      code: 'invalid-cursor',
      message: 'That cursor was not issued by this endpoint',
    });
  }
  return { updatedAt, id };
}
