import { ConflictException } from '@nestjs/common';

/**
 * The ownership switch's refusals for order processing (FR-ADM-10): owned
 * (the shop's own write is refused) and not owned (a machine's is). 409s, see
 * `ownershipErrors`. `detail` is for a log line, never a screen.
 *
 * Closed whole, like customers. Never the customer's own side: placing an
 * order, or calling off one nobody has answered.
 */
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
