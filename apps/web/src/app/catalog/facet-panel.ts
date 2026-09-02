import { Component, computed, inject, input, signal } from '@angular/core';
import {
  Facet,
  FacetValue,
  formatAttributeValue,
  SearchSort,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { NgTemplateOutlet } from '@angular/common';
import { Checkbox } from '../ui/checkbox';
import { DisclosureToggle } from '../ui/disclosure-toggle';
import { IconButton } from '../ui/icon-button';
import { Icon } from '../ui/icons/icon';
import { ProductSortSelect } from './product-sort-select';
import { FacetSelection, selectedValues } from './facet-selection';

/** Values a facet shows before its own "show more" reveals the rest. */
const VALUES_COLLAPSED = 8;

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
 */
export const FACET_LAYOUT =
  'flex flex-col gap-5 @min-[63.75rem]/listing:flex-row @min-[63.75rem]/listing:items-start';
export const FACET_COLUMN = 'shrink-0 @min-[63.75rem]/listing:w-60';

/**
 * The attribute filter panel (FR-ATTR-04…07) — the left column of the category
 * listing and of the search results, and a disclosure above the grid on narrow
 * screens.
 *
 * It owns no selection state. What is ticked is what the API said is ticked:
 * every facet value arrives with `selected` and with the count it would leave,
 * both computed server-side from the same URL the panel writes. So the panel
 * renders its input and navigates — the round trip through the URL is what
 * changes it, exactly as `product-sort-select.ts` treats sort.
 *
 * What is ticked is *shown* by the applied-filter chips above the grid, not
 * here: a summary inside the panel would move the facet lists under the cursor
 * the moment a box was ticked.
 */
@Component({
  selector: 'app-facet-panel',
  imports: [
    NgTemplateOutlet,
    Checkbox,
    DisclosureToggle,
    Icon,
    IconButton,
    ProductSortSelect,
  ],
  providers: [FacetSelection],
  template: `
    <!-- One details-free disclosure: the summary element cannot host the
         "always open once it is a column" behaviour without JavaScript
         re-opening it on every resize, and the button carries the selected
         count anyway. The button itself is the app's shared one — the admin
         grids open their filters with the same control.

         Toggle and panel share one border, so it is visible which controls
         belong to the disclosure; at column width that border, and the toggle
         with it, are gone and this is simply the column. -->
    <div class="flex items-start gap-1">
      <div
        class="min-w-0 flex-1 rounded-md border transition-colors @min-[63.75rem]/listing:rounded-none @min-[63.75rem]/listing:border-0"
        [class]="
          open()
            ? 'border-accent'
            : 'border-border-strong @min-[63.75rem]/listing:border-transparent'
        "
      >
        <app-disclosure-toggle
          class="@min-[63.75rem]/listing:hidden"
          [label]="text.title"
          [count]="selectedCount()"
          [countLabel]="selectedLabel(selectedCount())"
          [open]="open()"
          [panelId]="panelId"
          (toggled)="open.set(!open())"
        />
        <!-- Grown and shrunk rather than shown and hidden, which is what says
             the two are one thing: a grid row going from 0fr to 1fr, since a
             height cannot be transitioned to "as tall as the content". Always
             open at column width, where there is no toggle to open it. -->
        <div
          class="grid transition-[grid-template-rows] duration-200 ease-out"
          [class]="
            open()
              ? 'grid-rows-[1fr]'
              : 'grid-rows-[0fr] @min-[63.75rem]/listing:grid-rows-[1fr]'
          "
        >
          <div class="overflow-hidden">
            <div
              [id]="panelId"
              class="border-t border-border px-4 py-4 @min-[63.75rem]/listing:border-t-0 @min-[63.75rem]/listing:p-0"
              role="group"
              [attr.aria-label]="text.title"
            >
              <!-- Only as a column: opened as a disclosure the button above
                   already says what this is, and a heading under it says it
                   twice. It shares its line with the way back to the whole
                   catalogue, which is the disclosure's own toggle row at any
                   narrower width. -->
              <div
                class="hidden items-center justify-between gap-2 @min-[63.75rem]/listing:flex"
              >
                <h2
                  class="text-xs font-medium tracking-wide text-subtle uppercase"
                >
                  {{ text.title }}
                </h2>
                <ng-container [ngTemplateOutlet]="clearAll" />
              </div>

              <!-- The ordering, for as long as there is no room for the row
                   above the grid that normally carries it: one control to
                   arrange the listing rather than two places to look. -->
              @if (sort(); as value) {
                <div class="@min-[63.75rem]/listing:hidden">
                  <app-product-sort-select
                    fieldId="facet-panel-sort"
                    [value]="value"
                    [defaultSort]="defaultSort()"
                    [withRelevance]="withRelevance()"
                  />
                </div>
              }

              <ul class="mt-4 space-y-6">
                @for (facet of facets(); track facet.slug) {
                  <li>
                    <h3 class="text-sm font-medium text-stone-800">
                      {{ facet.name }}
                    </h3>
                    <ul class="mt-2 space-y-1.5">
                      @for (value of shownValues(facet); track value.value) {
                        <li>
                          <!-- A zero-count value is disabled rather than hidden
                       (FR-ATTR-05): a list that reshuffles as it is clicked
                       cannot be read, and the greyed row is the answer to
                       "why can I not combine these two?". -->
                          <label
                            class="flex cursor-pointer items-start gap-2 text-sm"
                            [class.text-muted]="disabled(value)"
                            [class.cursor-not-allowed]="disabled(value)"
                          >
                            <input
                              type="checkbox"
                              appCheckbox
                              class="mt-0.5"
                              [checked]="value.selected"
                              [attr.checked]="value.selected ? '' : null"
                              [disabled]="disabled(value)"
                              (change)="toggle(facet, value)"
                            />
                            <span class="min-w-0 flex-1">
                              {{ label(facet, value) }}
                            </span>
                            <span class="text-xs text-subtle tabular-nums">
                              {{ value.count }}
                            </span>
                          </label>
                        </li>
                      }
                    </ul>
                    @if (facet.values.length > VALUES_COLLAPSED) {
                      <button
                        type="button"
                        class="mt-2 cursor-pointer text-xs text-accent hover:underline"
                        (click)="toggleExpanded(facet)"
                      >
                        {{
                          expanded(facet)
                            ? catalogText.showLess
                            : catalogText.showMore
                        }}
                      </button>
                    }
                  </li>
                }
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Beside the disclosure rather than inside it, where the admin grids
           put the same control: it undoes what the box holds, so it cannot be
           inside the part that is closed. Always rendered and inert while
           nothing is ticked, so nothing moves when the first box is ticked. -->
      <div class="@min-[63.75rem]/listing:hidden">
        <!-- Finger-sized for as long as the panel beside it is a disclosure,
             which a container query decides and the viewport-based default
             cannot see: on a thousand-pixel window this is still the phone's
             layout. -->
        <ng-container
          [ngTemplateOutlet]="clearAll"
          [ngTemplateOutletContext]="{ size: 'touch' }"
        />
      </div>
    </div>

    <ng-template #clearAll let-size="size">
      @if (selectedCount()) {
        <button
          appIconButton
          variant="danger"
          type="button"
          [size]="size ?? 'sm'"
          [attr.aria-label]="text.clearAll"
          [title]="text.clearAll"
          (click)="selection.clearAll()"
        >
          <app-icon name="funnel-x" />
        </button>
      } @else {
        <button
          appIconButton
          type="button"
          disabled
          class="opacity-40"
          [size]="size ?? 'sm'"
          [attr.aria-label]="text.clearAll"
          [title]="text.clearAll"
        >
          <app-icon name="funnel-x" />
        </button>
      }
    </ng-template>
  `,
})
export class FacetPanel {
  protected readonly selection = inject(FacetSelection);
  protected readonly catalogText = inject(APP_TEXT).catalog;
  protected readonly text = this.catalogText.filters;
  protected readonly VALUES_COLLAPSED = VALUES_COLLAPSED;
  /** A listing renders exactly one panel, so a constant id keeps the server's
   * markup and the browser's identical (as the sort control's does). */
  protected readonly panelId = 'facet-panel';

  /** The facets for the products in scope, in the registry's order. */
  readonly facets = input.required<readonly Facet[]>();

  /**
   * The listing's ordering, so the panel can carry the control where the row
   * above the grid has no room for it. Absent leaves it out — a listing with
   * nothing to sort passes nothing.
   */
  readonly sort = input<SearchSort | null>(null);
  readonly defaultSort = input<SearchSort>('name');
  readonly withRelevance = input(false);

  /** Open on narrow screens only; from the lg breakpoint up the panel is the
   * left column. */
  protected readonly open = signal(false);
  /** Facets the visitor expanded past the first few values. */
  private readonly manuallyExpanded = signal<ReadonlySet<string>>(new Set());

  protected readonly selectedCount = computed(() =>
    this.facets().reduce((n, f) => n + selectedValues(f).length, 0),
  );

  protected label(facet: Facet, value: FacetValue): string {
    return formatAttributeValue(value.value, facet.unit);
  }

  /** Zero-count values are dead ends — except one already ticked, which has to
   * stay clickable or a shared link could not be cleared. */
  protected disabled(value: FacetValue): boolean {
    return value.count === 0 && !value.selected;
  }

  /**
   * Expanded once asked for — or from the start where a selected value sits
   * past the cutoff, so a shared link never hides part of its own filter.
   */
  protected expanded(facet: Facet): boolean {
    return (
      this.manuallyExpanded().has(facet.slug) ||
      facet.values.slice(VALUES_COLLAPSED).some((v) => v.selected)
    );
  }

  protected shownValues(facet: Facet): readonly FacetValue[] {
    return this.expanded(facet)
      ? facet.values
      : facet.values.slice(0, VALUES_COLLAPSED);
  }

  protected toggleExpanded(facet: Facet): void {
    const next = new Set(this.manuallyExpanded());
    if (this.expanded(facet)) next.delete(facet.slug);
    else next.add(facet.slug);
    this.manuallyExpanded.set(next);
  }

  protected selectedLabel(count: number): string {
    return this.text.selected.replace('{count}', String(count));
  }

  protected toggle(facet: Facet, value: FacetValue): void {
    this.selection.apply(this.facets(), facet.slug, (values) =>
      value.selected
        ? values.filter((v) => v !== value.value)
        : [...values, value.value],
    );
  }
}
