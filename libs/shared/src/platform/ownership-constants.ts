/**
 * The areas another system may own. Import-free, so an editor greying a field
 * does not pull Zod in. The catalog's owned fields sit beside the API's check
 * (`admin/catalog/owned-fields.ts`); customers and orders are closed whole,
 * as every staff button on them writes the same record.
 */

/** Closed in code: an area is a rule about who writes which rows. Stored one by
 * one: "the whole shop" is a read over the list, never a fourth flag. */
export const OWNERSHIP_AREAS = ['catalog', 'customers', 'orders'] as const;
export type OwnershipArea = (typeof OWNERSHIP_AREAS)[number];

/** In pairs: the admin is told the exchange holds the pen, the client that it
 * does not. A 409, as the request would be obeyed under the other setting; a
 * code per area, as the panel words each one. */
export const ownershipErrors = {
  'catalog-externally-owned': { status: 409 },
  'catalog-not-externally-owned': { status: 409 },
  'customers-externally-owned': { status: 409 },
  'customers-not-externally-owned': { status: 409 },
  'orders-externally-owned': { status: 409 },
  'orders-not-externally-owned': { status: 409 },
} as const;
