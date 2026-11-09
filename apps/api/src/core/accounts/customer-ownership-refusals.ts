import { ConflictException } from '@nestjs/common';

/**
 * The ownership switch's refusals for customer accounts (FR-ADM-10): owned
 * (the shop's own write is refused) and not owned (a machine's is). 409s, see
 * `ownershipErrors`. `detail` is for a log line, never a screen; the area is
 * closed whole (FR-AUTH-04), so it names the action, not fields.
 */
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
