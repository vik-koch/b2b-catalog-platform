import { ProductAvailability } from '@b2b-catalog-platform/shared/core/catalog';
import {
  adminProductAvailabilityFilterSchema,
  AdminProductSort,
  adminProductSortSchema,
  AdminProductState,
  adminProductStateSchema,
} from '@b2b-catalog-platform/shared/admin/catalog';

/** The product grid's URL state (FR-ADM-05). */
export const DEFAULT_ADMIN_SORT: AdminProductSort = 'relevance';
export const DEFAULT_ADMIN_STATE: AdminProductState = 'all';

/** A hand-edited or stale parameter resolves to the default rather than
 * becoming a request the API would reject. */
export function resolveAdminSort(raw: string): AdminProductSort {
  const parsed = adminProductSortSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_ADMIN_SORT;
}

export function resolveAdminState(raw: string): AdminProductState {
  const parsed = adminProductStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_ADMIN_STATE;
}

/**
 * The stock filter (FR-ADM-05), whose default is *no* filter rather than a
 * value — so an unreadable or absent parameter resolves to undefined and the
 * grid shows everything, untracked products included.
 */
export function resolveAdminAvailability(
  raw: string,
): ProductAvailability | undefined {
  const parsed = adminProductAvailabilityFilterSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
