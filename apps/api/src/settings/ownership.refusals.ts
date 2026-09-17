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

/**
 * The customer area's refusals, in the same pair the catalog has.
 *
 * `detail` names the action rather than a field, because this area is closed
 * whole (FR-AUTH-04 as amended) — there is no list of columns to report, and
 * the screens stay readable, so a person who meets this has clicked a control
 * that already told them it would be refused.
 */
export const customersExternallyOwned = (detail?: string) =>
  new ConflictException({
    code: 'customers-externally-owned',
    message: detail
      ? `Customer accounts are externally owned; refused: ${detail}`
      : 'Customer accounts are externally owned',
  });

/**
 * The other half of the customer pair, raised by the machine route: the token
 * is good, the platform is simply not listening on this area because nobody
 * has handed it over.
 */
export const customersNotExternallyOwned = () =>
  new ConflictException({
    code: 'customers-not-externally-owned',
    message:
      'Customer accounts are not externally owned; automated customer runs are refused',
  });
