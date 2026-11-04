/**
 * The areas another system may own. Import-free, so an editor greying a field
 * does not pull Zod in. The catalog's owned fields sit beside the API's check;
 * customers and orders are closed whole.
 */

/** Stored one by one: "the whole shop" is a read over the list, never a
 * fourth flag. */
export const OWNERSHIP_AREAS = ['catalog', 'customers', 'orders'] as const;
export type OwnershipArea = (typeof OWNERSHIP_AREAS)[number];

/** A 409 either way, as the request would be obeyed under the other setting;
 * a code per area, as the panel words each one. */
export const ownershipErrors = {
  'catalog-externally-owned': { status: 409 },
  'catalog-not-externally-owned': { status: 409 },
  'customers-externally-owned': { status: 409 },
  'customers-not-externally-owned': { status: 409 },
  'orders-externally-owned': { status: 409 },
  'orders-not-externally-owned': { status: 409 },
} as const;
