import { ConflictException } from '@nestjs/common';

/**
 * The ownership switch's refusals (FR-ADM-10), a pair per area: owned (the
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

/** Closed whole (FR-AUTH-04), so `detail` names the action, not fields. */
export const customersExternallyOwned = (detail?: string) =>
  new ConflictException({
    code: 'customers-externally-owned',
    message: detail
      ? `Customer accounts are externally owned; refused: ${detail}`
      : 'Customer accounts are externally owned',
  });

export const customersNotExternallyOwned = () =>
  new ConflictException({
    code: 'customers-not-externally-owned',
    message:
      'Customer accounts are not externally owned; automated customer runs are refused',
  });

/** Closed whole, like customers. Never the customer's own side: placing an
 * order, or calling off one nobody has answered. */
export const ordersExternallyOwned = (detail?: string) =>
  new ConflictException({
    code: 'orders-externally-owned',
    message: detail
      ? `Order processing is externally owned; refused: ${detail}`
      : 'Order processing is externally owned',
  });

export const ordersNotExternallyOwned = () =>
  new ConflictException({
    code: 'orders-not-externally-owned',
    message:
      'Order processing is not externally owned; automated order writes are refused',
  });
