import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { formatAttributeValue } from '@b2b-catalog-platform/shared/core/catalog';
import {
  Facet,
  FacetValue,
} from '@b2b-catalog-platform/shared/storefront/catalog';
import { ClearFiltersButton } from '@b2b-catalog-platform/ui/actions/clear-filters-button';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { TickLabel } from '@b2b-catalog-platform/ui/choices/tick-label';
import { DisclosureFrame } from '@b2b-catalog-platform/ui/disclosure/disclosure-frame';
import { disclosureState } from '@b2b-catalog-platform/ui/disclosure/disclosure-state';
import { DisclosureToggle } from '@b2b-catalog-platform/ui/disclosure/disclosure-toggle';
import { ShowMoreList } from '@b2b-catalog-platform/ui/disclosure/show-more-list';
import { STOREFRONT_TEXT } from '../../../../shared/config/storefront-text';

const VALUES_COLLAPSED = 8;

export interface FacetValueToggle {
  facet: Facet;
  value: FacetValue;
}

/** The attribute filters as drawn: a disclosure above the listing, its left
 * column from FACET_LAYOUT's width. A projected sort control stands above the
 * facets while the row above the grid has no room for it. */
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
    <!-- Not <details>: "always open as a column" would need script on every
         resize. Toggle and panel share one border, gone at column width. -->
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
        <!-- Not Collapsible: always open from a container width, which its
             viewport breakpoint cannot see. 300ms, slower than the admin's
             row: over this distance 200ms reads as the page jumping. -->
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
              <!-- Only as a column: as a disclosure the toggle names it. -->
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
                          <!-- Disabled, not hidden (FR-ATTR-05): a list that
                               reshuffles as it is clicked cannot be read. -->
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
                            <!-- leading-5: the row is top-aligned for a value
                                 that wraps, and a 1rem line box sat high. -->
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

      <!-- Beside the disclosure, not in the part that closes. Centred on the
           toggle row: h-10 is its height, mt-px the frame's border. -->
      <div class="mt-px flex h-10 items-center @min-[63.75rem]/listing:hidden">
        <!-- Finger-sized by hand: the default size follows the viewport,
             and this layout follows the container. -->
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
  /** A constant, so server and browser agree: a listing has one panel. */
  protected readonly panelId = 'facet-panel';

  readonly facets = input.required<readonly Facet[]>();
  readonly sorted = input(false);

  readonly valueToggled = output<FacetValueToggle>();
  readonly cleared = output();

  /** A gap under the sort control, or as a column under the heading. */
  protected readonly facetList = computed(
    () =>
      `space-y-6 @min-[63.75rem]/listing:mt-4${this.sorted() ? ' mt-4' : ''}`,
  );

  protected readonly disclosure = disclosureState(300);
  protected readonly open = this.disclosure.open;

  /** Animated only while a toggle runs, so a resize past the column width
   * has nothing to animate. */
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

  /** Shut is also `invisible`, taking the checkboxes out of the tab order;
   * visibility transitions so the panel stays drawn while it closes. */
  protected readonly panelContent = computed(() => {
    const move = this.disclosure.animated()
      ? ' transition-[visibility] duration-300'
      : '';
    return `min-h-0 overflow-hidden${move} ${
      this.open() ? 'visible' : 'invisible @min-[63.75rem]/listing:visible'
    }`;
  });

  private readonly manuallyExpanded = signal<ReadonlySet<string>>(new Set());

  protected readonly selectedCount = computed(() =>
    this.facets().reduce(
      (n, facet) => n + facet.values.filter((v) => v.selected).length,
      0,
    ),
  );

  protected readonly selectedLabel = computed(() =>
    fillText(this.text.selected, { count: this.selectedCount() }),
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

  /** Also where a ticked value sits past the cutoff, so a shared link never
   * hides part of its own filter. */
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
