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

/**
 * Order processing, closed the same way the customer area is and for the same
 * reason: an owning system answers orders, and a platform that also answered
 * them would answer them differently.
 *
 * `detail` names the act, since there are no columns to report here either.
 * What it never covers is the customer's own side — placing an order, and
 * calling off one nobody has answered — which stays open however the area is
 * owned.
 */
export const ordersExternallyOwned = (detail?: string) =>
  new ConflictException({
    code: 'orders-externally-owned',
    message: detail
      ? `Order processing is externally owned; refused: ${detail}`
      : 'Order processing is externally owned',
  });

/** The other half of the pair, for the machine route that writes orders back:
 * the token is good, nobody has handed the area over. */
export const ordersNotExternallyOwned = () =>
  new ConflictException({
    code: 'orders-not-externally-owned',
    message:
      'Order processing is not externally owned; automated order writes are refused',
  });
