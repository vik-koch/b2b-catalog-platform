import { ProductAvailability } from '@b2b-catalog-platform/shared/core/catalog';
import {
  adminProductAvailabilityFilterSchema,
  AdminProductSort,
  adminProductSortSchema,
  AdminProductState,
  adminProductStateSchema,
} from '@b2b-catalog-platform/shared/admin/catalog';

/** The product grid's URL state (FR-ADM-05). */
export const DEFAULT_SORT: AdminProductSort = 'relevance';
export const DEFAULT_STATE: AdminProductState = 'all';

/** A hand-edited or stale parameter resolves to the default rather than
 * becoming a request the API would reject. */
export function resolveSort(raw: string): AdminProductSort {
  const parsed = adminProductSortSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_SORT;
}

export function resolveState(raw: string): AdminProductState {
  const parsed = adminProductStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_STATE;
}

/** The stock filter's default is no filter, so untracked products show too. */

export function resolveAvailability(
  raw: string,
): ProductAvailability | undefined {
  const parsed = adminProductAvailabilityFilterSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}
