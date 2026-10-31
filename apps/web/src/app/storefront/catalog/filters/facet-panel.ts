import { Component, computed, inject, input } from '@angular/core';
import { PRODUCT_SORTS } from '@b2b-catalog-platform/shared/core/catalog';
import {
  Facet,
  ListingSort,
} from '@b2b-catalog-platform/shared/storefront/catalog';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { FacetSelection } from './facet-selection';
import { ProductSortSelect } from './product-sort-select';
import { FacetFilters, FacetValueToggle } from './ui/facet-filters';

/**
 * From 63.75rem the panel is a column beside the listing, else a disclosure
 * above it. The column is the first track of the listing's own 15rem family
 * (PRODUCT_GRID), so it grows with the cards; 63.75rem is where a listing one
 * track narrower still holds three cards or three lines. Measured on the
 * listing's container: the window would miss the 15px scrollbar.
 */
export const FACET_LAYOUT = `flex flex-col gap-4
                             @min-[63.75rem]/listing:grid
                             @min-[63.75rem]/listing:grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))]
                             @min-[63.75rem]/listing:items-start`;
export const FACET_COLUMN = 'min-w-0';
/** Start and end, not `col-[2/-1]`: Tailwind reads the slash as a modifier
 * and never generates the class. */
export const FACET_SIBLING = `min-w-0
                              @min-[63.75rem]/listing:col-start-2
                              @min-[63.75rem]/listing:col-end-[-1]`;
export const FACET_SIBLING_ALONE =
  'min-w-0 @min-[63.75rem]/listing:col-span-full';
/** The sort above the listing, hidden where the panel's disclosure carries
 * it. Only with a panel: without one, a narrow screen would lose the sort. */
export const FACET_HEADER_SORT = 'hidden @min-[63.75rem]/listing:block';

/** The attribute filter panel (FR-ATTR-04…07). It holds no selection: what is
 * ticked is what the API answered for the URL the panel writes. */
@Component({
  selector: 'app-facet-panel',
  imports: [FacetFilters, ProductSortSelect],
  providers: [FacetSelection],
  template: `
    <app-facet-filters
      [facets]="facets()"
      [sorted]="!!shownSort()"
      (valueToggled)="toggle($event)"
      (cleared)="selection.clearAll()"
    >
      <!-- While the row above the grid has no room for it. -->
      @if (shownSort(); as value) {
        <app-product-sort-select
          fieldId="facet-panel-sort"
          [value]="value"
          [defaultSort]="defaultSort()"
          [options]="sortOptions()"
        />
      }
    </app-facet-filters>
  `,
})
export class FacetPanel {
  protected readonly selection = inject(FacetSelection);

  readonly facets = input.required<readonly Facet[]>();

  readonly sort = input<ListingSort | null>(null);
  readonly defaultSort = input<ListingSort>('name');
  readonly sortOptions = input<readonly ListingSort[]>(PRODUCT_SORTS);

  /** The flag is read here too, though the control hides itself: whether
   * anything stands above the facets is this panel's layout. */
  protected readonly shownSort = computed(() =>
    this.sortControlsEnabled ? this.sort() : null,
  );
  private readonly sortControlsEnabled =
    inject(DEPLOYMENT_CONFIG).catalog.sortControlsEnabled;

  protected toggle({ facet, value }: FacetValueToggle): void {
    this.selection.apply(this.facets(), facet.slug, (values) =>
      value.selected
        ? values.filter((v) => v !== value.value)
        : [...values, value.value],
    );
  }
}
