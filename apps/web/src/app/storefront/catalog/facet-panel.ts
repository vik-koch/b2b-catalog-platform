import { Component, computed, inject, input } from '@angular/core';
import {
  Facet,
  ListingSort,
  PRODUCT_SORTS,
} from '@b2b-catalog-platform/shared/storefront/catalog';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { ProductSortSelect } from './product-sort-select';
import { FacetSelection } from './facet-selection';
import { FacetFilters, FacetValueToggle } from './ui/facet-filters';

/**
 * Where the panel stops being a disclosure above the listing and becomes a
 * column beside it, and how wide that column is.
 *
 * Neither is a matter of taste. The panel is a column of the same grid the
 * cards are in — one track wide, with the grid's own gap beside it — so at
 * the page's full width it is the first of five and the cards beside it keep
 * the width they have without it.
 *
 * It arrives where a listing one track and one gap narrower still holds three
 * of them: 63.75rem. That one width answers both layouts. The grid keeps the
 * three columns it had just below it, and a line keeps its three (47.5rem —
 * `ProductRow`, which is what three tracks come to). Any earlier and whatever
 * is beside the panel would rearrange the moment it appeared.
 *
 * Measured against the listing's own width, not the window's — a scrollbar is
 * 15px the media query does not see but the grid does, which is most of that
 * room. `@container/listing` is declared by each listing on its section.
 *
 * Exported with the panel's own two states rather than written at each call
 * site, because all three have to name the same width.
 *
 * At column width the two are a grid on the listing's own track family — the
 * 15rem tracks of PRODUCT_GRID — rather than a fixed column beside a flexible
 * grid: the panel is the first of the five columns the page is drawn on, so it
 * has to grow with them. Fixed at 15rem it stayed put while the cards beside it
 * stretched, and the two only agreed at the width where a new column had just
 * landed. The product grid keeps its own `auto-fill` inside the tracks it is
 * given, which comes out at the same width: an area of n-1 tracks and their
 * gaps fits exactly n-1 columns of the same size.
 */
export const FACET_LAYOUT = `flex flex-col gap-4
                             @min-[63.75rem]/listing:grid
                             @min-[63.75rem]/listing:grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))]
                             @min-[63.75rem]/listing:items-start`;
export const FACET_COLUMN = 'min-w-0';
/** The listing beside the panel: everything the panel's one track leaves. A
 * listing with no facets has no panel either, and takes the lot. */
/* Start and end rather than one `col-[2/-1]`: a slash in a utility is
 * Tailwind's modifier separator, so that class is never generated and the
 * listing silently falls back to a single track. */
export const FACET_SIBLING = `min-w-0
                              @min-[63.75rem]/listing:col-start-2
                              @min-[63.75rem]/listing:col-end-[-1]`;
export const FACET_SIBLING_ALONE =
  'min-w-0 @min-[63.75rem]/listing:col-span-full';

/**
 * The attribute filter panel (FR-ATTR-04…07): the left column of the category
 * listing and of the search results, and a disclosure above the grid on narrow
 * screens.
 *
 * It owns no selection state. What is ticked is what the API said is ticked:
 * every facet value arrives with `selected` and with the count it would leave,
 * both computed server-side from the same URL the panel writes. So the panel
 * renders its input and navigates; the round trip through the URL is what
 * changes it, exactly as `product-sort-select.ts` treats sort.
 *
 * What is ticked is *shown* by the applied-filter chips above the grid, not
 * here: a summary inside the panel would move the facet lists under the cursor
 * the moment a box was ticked.
 */
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
      <!-- The ordering, for as long as there is no room for the row above the
           grid that normally carries it: one control to arrange the listing
           rather than two places to look. -->
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

  /** The facets for the products in scope, in the registry's order. */
  readonly facets = input.required<readonly Facet[]>();

  /**
   * The listing's ordering, so the panel can carry the control where the row
   * above the grid has no room for it. Absent leaves it out: a listing with
   * nothing to sort passes nothing.
   */
  readonly sort = input<ListingSort | null>(null);
  readonly defaultSort = input<ListingSort>('name');
  readonly sortOptions = input<readonly ListingSort[]>(PRODUCT_SORTS);

  /**
   * The ordering this panel actually draws: what the listing passed, unless
   * the deployment has switched the control off (FR-SEARCH-04).
   *
   * The flag is read here as well as inside the control. The control hiding
   * itself is what makes a call site safe to forget; whether anything stands
   * above the facets is layout, and this panel is the only thing that knows.
   */
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
