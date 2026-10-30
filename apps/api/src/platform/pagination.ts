import type { Pagination } from '@b2b-catalog-platform/shared/platform';

/** The envelope for one page of `total` rows. */
export function paginationOf(
  page: number,
  pageSize: number,
  total: number,
): Pagination {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
