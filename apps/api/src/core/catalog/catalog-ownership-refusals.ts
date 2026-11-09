import { ConflictException } from '@nestjs/common';

/**
 * The ownership switch's refusals for the catalog (FR-ADM-10): owned (the
 * shop's own write is refused) and not owned (a machine's is). 409s, see
 * `ownershipErrors`. `detail` is for a log line, never a screen.
 */
export const catalogExternallyOwned = (detail?: string) =>
  new ConflictException({
    code: 'catalog-externally-owned',
    message: detail
      ? `The catalog is externally owned; refused: ${detail}`
      : 'The catalog is externally owned',
  });

export const catalogNotExternallyOwned = () =>
  new ConflictException({
    code: 'catalog-not-externally-owned',
    message:
      'The catalog is not externally owned; automated catalog runs are refused',
  });
