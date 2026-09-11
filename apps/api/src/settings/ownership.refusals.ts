import { ConflictException } from '@nestjs/common';

/**
 * The two refusals the ownership switch produces (FR-ADM-10), raised the way
 * every other service refusal here is: a Nest exception carrying the contract
 * code, restated by the `refusals` middleware.
 *
 * A 409 rather than a 403 — see `ownershipErrors`. The messages are
 * developer-facing and never rendered, so the field list one of them carries is
 * for a log line and a `curl`, not for a screen: the panel already greys the
 * fields it will not let go through.
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
