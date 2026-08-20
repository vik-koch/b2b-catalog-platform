import { Component, computed, inject, input } from '@angular/core';
import { Facet, formatAttributeValue } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { Icon } from '../ui/icons/icon';
import { FacetSelection, selectedValues } from './facet-selection';

/** One ticked value, as the chip row needs it. */
interface AppliedFilter {
  slug: string;
  value: string;
  label: string;
}

/**
 * The applied attribute filters as removable chips (FR-ATTR-05/06) — what the
 * panel's checkboxes add up to, said once, above the grid.
 *
 * It sits in the listing's title row, which is on screen whether or not
 * anything is selected: a chip row of its own would push the grid down the
 * moment a box was ticked, and the tiles would move under the cursor of
 * someone reading the panel.
 *
 * That row is too narrow to share on a phone — a chip wraps to three lines
 * between the heading and the sort control — so the hosts hide it there. What
 * is ticked is reported by the count on the "Filters" disclosure instead, and
 * cleared inside it.
 */
@Component({
  selector: 'app-applied-filters',
  imports: [Icon],
  providers: [FacetSelection],
  template: `
    @if (applied().length) {
      <ul
        class="flex flex-wrap items-center gap-2"
        [attr.aria-label]="text.appliedLabel"
      >
        <!-- The label carries both the attribute's name and the value, and
             attribute names are unique, so it identifies the chip. -->
        @for (filter of applied(); track filter.label) {
          <li
            class="flex items-center gap-1.5 rounded-full bg-stone-100 py-1 pr-1.5 pl-3 text-sm"
          >
            <span>{{ filter.label }}</span>
            <button
              type="button"
              class="flex items-center justify-center cursor-pointer rounded-full p-0.5 text-stone-400 hover:text-red-700"
              [attr.aria-label]="removeLabel(filter)"
              (click)="remove(filter)"
            >
              <app-icon name="close" class="h-3.5 w-3.5" />
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class AppliedFilters {
  private readonly selection = inject(FacetSelection);
  protected readonly text = inject(APP_TEXT).catalog.filters;

  /** The facets as the API returned them; what is ticked is read off them. */
  readonly facets = input.required<readonly Facet[]>();

  /** In panel order, so a chip sits where its attribute does in the column. */
  protected readonly applied = computed<AppliedFilter[]>(() =>
    this.facets().flatMap((facet) =>
      selectedValues(facet).map((value) => ({
        slug: facet.slug,
        value,
        label: `${facet.name}: ${formatAttributeValue(value, facet.unit)}`,
      })),
    ),
  );

  protected removeLabel(filter: AppliedFilter): string {
    return this.text.remove.replace('{label}', filter.label);
  }

  protected remove(filter: AppliedFilter): void {
    this.selection.apply(this.facets(), filter.slug, (values) =>
      values.filter((v) => v !== filter.value),
    );
  }
}
