import { Component, computed, inject, input, signal } from '@angular/core';
import {
  Facet,
  FacetValue,
  formatAttributeValue,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Icon } from '../ui/icons/icon';
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
  imports: [Checkbox, Button, Icon],
  providers: [FacetSelection],
  template: `
    <!-- One details-free disclosure: the summary element cannot host the
         "always open once it is a column" behaviour without JavaScript
         re-opening it on every resize, and the button carries the selected
         count anyway. -->
    <button
      type="button"
      class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-border-strong px-4 py-2.5 text-sm font-medium @min-[63.75rem]/listing:hidden"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="panelId"
      (click)="open.set(!open())"
    >
      <span>
        {{ text.title }}
        @if (selectedCount(); as count) {
          <span class="ml-1 text-accent">{{ selectedLabel(count) }}</span>
        }
      </span>
      <app-icon
        name="chevron-down"
        class="h-4 w-4 text-subtle transition-transform"
        [class.rotate-180]="open()"
      />
    </button>

    <div
      [id]="panelId"
      class="mt-4 @min-[63.75rem]/listing:mt-0 @min-[63.75rem]/listing:block"
      [class.hidden]="!open()"
      role="group"
      [attr.aria-label]="text.title"
    >
      <h2 class="text-xs font-semibold tracking-wide text-subtle uppercase">
        {{ text.title }}
      </h2>

      <ul class="mt-4 space-y-6">
        @for (facet of facets(); track facet.slug) {
          <li>
            <h3 class="text-sm font-medium text-stone-800">{{ facet.name }}</h3>
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
                  expanded(facet) ? catalogText.showLess : catalogText.showMore
                }}
              </button>
            }
          </li>
        }
      </ul>

      <!-- Below the whole panel and always rendered, disabled while nothing is
           ticked: appearing with the first selection would shift every facet
           list the moment one was clicked. -->
      <button
        type="button"
        appButton
        variant="secondary"
        size="sm"
        class="mt-6 w-full disabled:opacity-50"
        [disabled]="!selectedCount()"
        (click)="selection.clearAll()"
      >
        {{ text.clearAll }}
      </button>
    </div>
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
