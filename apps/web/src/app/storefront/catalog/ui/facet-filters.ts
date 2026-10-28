import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  Facet,
  FacetValue,
  formatAttributeValue,
} from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { TickLabel } from '@b2b-catalog-platform/ui/choices/tick-label';
import { disclosureState } from '@b2b-catalog-platform/ui/disclosure/disclosure-state';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import { ShowMoreList } from '@b2b-catalog-platform/ui/disclosure/show-more-list';
import { ClearFiltersButton } from '@b2b-catalog-platform/ui/actions/clear-filters-button';

/** Values a facet shows before its own "show more" reveals the rest. */
const VALUES_COLLAPSED = 8;

/** One value ticked or unticked, as the visitor asked. */
export interface FacetValueToggle {
  facet: Facet;
  value: FacetValue;
}

/**
 * The attribute filters as drawn: a disclosure above the listing, and from
 * the listing's column width (FACET_LAYOUT) its left column. It renders the
 * facets it is given and reports what was asked; the selection lives in the
 * URL, which the container writes. A sort control the container projects
 * stands above the facets while there is no row above the grid to carry it.
 */
@Component({
  selector: 'app-facet-filters',
  imports: [
    ClearFiltersButton,
    Checkbox,
    TickLabel,
    DisclosureToggle,
    ShowMoreList,
    DisclosureFrame,
  ],
  template: `
    <!-- One details-free disclosure: the summary element cannot host the
         "always open once it is a column" behaviour without JavaScript
         re-opening it on every resize, and the button carries the selected
         count anyway.

         Toggle and panel share one border, so it is visible which controls
         belong to the disclosure; at column width that border, and the toggle
         with it, are gone and this is simply the column. -->
    <div class="flex items-start gap-1">
      <div
        class="min-w-0 flex-1 rounded-md border
               @min-[63.75rem]/listing:rounded-none
               @min-[63.75rem]/listing:border-0"
        uiDisclosureFrame
        [open]="open()"
        [class]="open() ? '' : '@min-[63.75rem]/listing:border-transparent'"
      >
        <ui-disclosure-toggle
          class="@min-[63.75rem]/listing:hidden"
          [label]="text.title"
          [count]="selectedCount()"
          [countLabel]="selectedLabel()"
          [open]="open()"
          [panelId]="panelId"
          (toggled)="disclosure.toggle()"
        />
        <!-- Grown and shrunk rather than shown and hidden, which is what says
             the two are one thing. Not Collapsible: this one is always open
             from a container width, which Collapsible's viewport breakpoint
             cannot see.

             Slower than the admin's short filter row, because this panel is
             usually several facets of a dozen values each: over that distance
             200ms reads as the page jumping rather than as the panel opening. -->
        <div [class]="panelRow()">
          <div [class]="panelContent()">
            <div
              [id]="panelId"
              class="border-t border-edge p-4
                     @min-[63.75rem]/listing:border-t-0
                     @min-[63.75rem]/listing:p-0"
              role="group"
              [attr.aria-label]="text.title"
            >
              <!-- Only as a column: opened as a disclosure the button above
                   already says what this is, and a heading under it says it
                   twice. It shares its line with the way back to the whole
                   catalogue, which is the disclosure's own toggle row at any
                   narrower width. -->
              <div
                class="hidden items-center justify-between h-8 gap-2
                       @min-[63.75rem]/listing:flex"
              >
                <h2
                  class="text-xs font-medium tracking-wide text-ink-subtle
                         uppercase"
                >
                  {{ text.title }}
                </h2>
                <ui-clear-filters-button
                  [label]="text.clearAll"
                  [filtered]="selectedCount() > 0"
                  (cleared)="cleared.emit()"
                />
              </div>

              @if (sorted()) {
                <div class="@min-[63.75rem]/listing:hidden">
                  <ng-content />
                </div>
              }

              <ul [class]="facetList()">
                @for (facet of facets(); track facet.slug) {
                  <li>
                    <h3 class="text-sm font-medium text-ink">
                      {{ facet.name }}
                    </h3>
                    <ui-show-more-list
                      class="mt-2"
                      spaced
                      [items]="facet.values"
                      [limit]="VALUES_COLLAPSED"
                      [open]="expanded(facet)"
                      [restId]="'facet-rest-' + facet.slug"
                      [trackBy]="byValue"
                      (toggled)="toggleExpanded(facet)"
                    >
                      <ng-template let-value>
                        <li>
                          <!-- A zero-count value is disabled rather than hidden
                               (FR-ATTR-05): a list that reshuffles as it is
                               clicked cannot be read, and the greyed row is the
                               answer to "why can I not combine these two?". -->
                          <label
                            uiTickLabel
                            [class.text-ink-subtle]="disabled(value)"
                          >
                            <input
                              type="checkbox"
                              uiCheckbox
                              [checked]="value.selected"
                              [attr.checked]="value.selected ? '' : null"
                              [disabled]="disabled(value)"
                              (change)="valueToggled.emit({ facet, value })"
                            />
                            <span class="min-w-0 flex-1">
                              {{ label(facet, value) }}
                            </span>
                            <!-- leading-5 so the smaller count shares the
                                 label's line box: the row is top-aligned for
                                 the sake of a value that wraps, and a 1rem line
                                 box in a 1.25rem row sat visibly high. -->
                            <span
                              class="text-xs/5 px-2 text-ink-subtle
                                     tabular-nums"
                            >
                              {{ value.count }}
                            </span>
                          </label>
                        </li>
                      </ng-template>
                    </ui-show-more-list>
                  </li>
                }
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Beside the disclosure rather than inside it, where the admin grids
           put the same control: it undoes what the box holds, so it cannot be
           inside the part that is closed. -->
      <!-- Centred on the toggle row rather than on the box, which grows as the
           panel opens: h-10 is the toggle's own height (py-2.5 around a
           text-sm line), and the mt-px is the frame's border, which the toggle
           sits below and this does not. -->
      <div class="mt-px flex h-10 items-center @min-[63.75rem]/listing:hidden">
        <!-- Finger-sized for as long as the panel beside it is a disclosure,
             which a container query decides and the viewport-based default
             cannot see: on a thousand-pixel window this is still the phone's
             layout. -->
        <ui-clear-filters-button
          size="touch"
          [label]="text.clearAll"
          [filtered]="selectedCount() > 0"
          (cleared)="cleared.emit()"
        />
      </div>
    </div>
  `,
})
export class FacetFilters {
  protected readonly text = inject(STOREFRONT_TEXT).catalog.filters;
  protected readonly VALUES_COLLAPSED = VALUES_COLLAPSED;
  /** A listing renders exactly one panel, so a constant id keeps the server's
   * markup and the browser's identical (as the sort control's does). */
  protected readonly panelId = 'facet-panel';

  /** The facets for the products in scope, in the registry's order. */
  readonly facets = input.required<readonly Facet[]>();
  /** Whether a sort control is projected to stand above the facets. */
  readonly sorted = input(false);

  readonly valueToggled = output<FacetValueToggle>();
  readonly cleared = output();

  /**
   * The gap above the facets, which has two reasons and only one of them is
   * in this class. Below the column width the sort control stands there; from
   * the column width up the sort is hidden and the panel's own heading stands
   * there instead, which is a container query and so lives in the class.
   */
  protected readonly facetList = computed(
    () =>
      `space-y-6 @min-[63.75rem]/listing:mt-4${this.sorted() ? ' mt-4' : ''}`,
  );

  protected readonly disclosure = disclosureState(300);
  protected readonly open = this.disclosure.open;

  /**
   * The row that grows and shrinks. The transition is only on the element
   * while a toggle's own movement runs (see disclosureState), so widening the
   * window past the column width changes the rows with nothing to animate.
   */
  protected readonly panelRow = computed(() => {
    const move = this.disclosure.animated()
      ? 'transition-[grid-template-rows] duration-300 ease-out '
      : '';
    return `grid ${move}${
      this.open()
        ? 'grid-rows-[1fr]'
        : 'grid-rows-[0fr] @min-[63.75rem]/listing:grid-rows-[1fr]'
    }`;
  });

  /**
   * Shut is `invisible` as well as clipped, so the folded checkboxes leave the
   * tab order. Visibility transitions too, so the panel stays drawn while it
   * closes.
   */
  protected readonly panelContent = computed(() => {
    const move = this.disclosure.animated()
      ? ' transition-[visibility] duration-300'
      : '';
    return `min-h-0 overflow-hidden${move} ${
      this.open() ? 'visible' : 'invisible @min-[63.75rem]/listing:visible'
    }`;
  });

  /** Facets the visitor expanded past the first few values. */
  private readonly manuallyExpanded = signal<ReadonlySet<string>>(new Set());

  protected readonly selectedCount = computed(() =>
    this.facets().reduce(
      (n, facet) => n + facet.values.filter((v) => v.selected).length,
      0,
    ),
  );

  protected readonly selectedLabel = computed(() =>
    this.text.selected.replace('{count}', String(this.selectedCount())),
  );

  protected readonly byValue = (value: FacetValue) => value.value;

  protected label(facet: Facet, value: FacetValue): string {
    return formatAttributeValue(value.value, facet.unit);
  }

  /** Zero-count values are dead ends, except one already ticked, which has to
   * stay clickable or a shared link could not be cleared. */
  protected disabled(value: FacetValue): boolean {
    return value.count === 0 && !value.selected;
  }

  /**
   * Expanded once asked for, or from the start where a selected value sits
   * past the cutoff, so a shared link never hides part of its own filter.
   */
  protected expanded(facet: Facet): boolean {
    return (
      this.manuallyExpanded().has(facet.slug) ||
      facet.values.slice(VALUES_COLLAPSED).some((v) => v.selected)
    );
  }

  protected toggleExpanded(facet: Facet): void {
    const next = new Set(this.manuallyExpanded());
    if (this.expanded(facet)) next.delete(facet.slug);
    else next.add(facet.slug);
    this.manuallyExpanded.set(next);
  }
}
