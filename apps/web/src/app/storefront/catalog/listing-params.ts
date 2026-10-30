import { computed, Signal } from '@angular/core';
import {
  encodeAttributeParams,
  parseAttributeParams,
} from '@b2b-catalog-platform/shared/core/catalog';
import { ListingSort } from '@b2b-catalog-platform/shared/storefront/catalog';

/** The query parameters as router input binding hands them over: `attr` is a
 * bare string for one value and an array beyond that. */
export interface ListingQuery {
  readonly page: Signal<string>;
  readonly sort: Signal<string>;
  readonly attr: Signal<string | readonly string[] | undefined>;
}

/**
 * Page, sort and attribute selection of a listing's URL, as the API is asked
 * for them and as its links carry them. A stale or hand-edited value falls
 * back rather than reaching the API; a default is an absent parameter, so the
 * default view keeps one URL.
 */
export function listingParams<S extends ListingSort>(
  query: ListingQuery,
  sorts: readonly S[],
  defaultSort: S,
) {
  const page = computed(() => {
    const n = Number(query.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  const sort = computed(() => {
    const raw = query.sort() as S;
    return sorts.includes(raw) ? raw : defaultSort;
  });
  const attr = computed(() =>
    encodeAttributeParams(parseAttributeParams(query.attr())),
  );
  const hasSelection = computed(() => attr().length > 0);
  return {
    page,
    sort,
    attr,
    hasSelection,
    sortParam: computed(() => sortParam(sort(), defaultSort)),
    attrParam: computed(() => (hasSelection() ? attr() : null)),
  };
}

/** The `sort` parameter, or `null` (left out) for the listing's default. */
export function sortParam(
  sort: ListingSort,
  defaultSort: ListingSort,
): ListingSort | null {
  return sort === defaultSort ? null : sort;
}
