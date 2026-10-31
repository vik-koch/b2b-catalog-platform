import { Component, computed, inject, input } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { formatAttributeValue } from '@b2b-catalog-platform/shared/core/catalog';
import { Facet } from '@b2b-catalog-platform/shared/storefront/catalog';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { FacetSelection, selectedValues } from './facet-selection';

interface AppliedFilter {
  slug: string;
  value: string;
  label: string;
}

/** The ticked values as removable chips (FR-ATTR-05/06), in the listing's
 * title row so that ticking never pushes the grid down. Hidden by the hosts on
 * a phone, where the disclosure's count says the same. */
@Component({
  selector: 'app-applied-filters',
  imports: [Icon],
  providers: [FacetSelection],
  template: `
    @if (applied().length) {
      <ul
        class="flex flex-wrap items-center gap-2"
        [attr.aria-label]="text.appliedAria"
      >
        <!-- Unique: attribute names are, and the label carries one. -->
        @for (filter of applied(); track filter.label) {
          <li
            class="flex items-center gap-1.5 rounded-full bg-surface py-1
                   pr-1.5 pl-3 text-sm"
          >
            <span>{{ filter.label }}</span>
            <button
              type="button"
              class="flex items-center justify-center cursor-pointer
                     rounded-full p-0.5 text-ink-subtle
                     hover:text-danger"
              [attr.aria-label]="removeLabel(filter)"
              (click)="remove(filter)"
            >
              <ui-icon [glyph]="xIcon" class="size-3.5" />
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class AppliedFilters {
  protected readonly xIcon = xIcon;
  private readonly selection = inject(FacetSelection);
  protected readonly text = inject(STOREFRONT_TEXT).catalog.filters;

  readonly facets = input.required<readonly Facet[]>();

  /** In panel order. */
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
    return fillText(this.text.removeAria, { label: filter.label });
  }

  protected remove(filter: AppliedFilter): void {
    this.selection.apply(this.facets(), filter.slug, (values) =>
      values.filter((v) => v !== filter.value),
    );
  }
}
