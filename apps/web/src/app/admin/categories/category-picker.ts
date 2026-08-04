import { Component, computed, input, output } from '@angular/core';
import { AdminCategory } from '@b2b-catalog-platform/shared';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { flattenCategoryTree } from './category-tree';

/**
 * Single-select category picker for the product editor: a native <select> whose
 * options are the category tree flattened depth-first and indented by depth. A
 * product belongs to exactly one category (the `categoryId` FK).
 */
@Component({
  selector: 'app-category-picker',
  imports: [AdminIcon, Input],
  template: `
    <div class="relative">
      <select
        appInput
        class="w-full appearance-none pr-10 pl-3"
        [attr.aria-label]="ariaLabel() || placeholder()"
        (change)="onChange($event)"
      >
        @if (emptyLabel() !== null) {
          <!-- A selectable "none" (e.g. top-level) — opt-in via emptyLabel. -->
          <option value="" [selected]="!value()">{{ emptyLabel() }}</option>
        } @else {
          <option value="" disabled [selected]="!value()">
            {{ placeholder() }}
          </option>
        }
        @for (o of options(); track o.id) {
          <option [value]="o.id" [selected]="o.id === value()">
            {{ indent(o.depth) }}{{ o.name }}
          </option>
        }
      </select>
      <app-admin-icon
        name="chevron-down"
        class="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-stone-400"
      />
    </div>
  `,
})
export class CategoryPicker {
  readonly categories = input.required<readonly AdminCategory[]>();
  readonly value = input<string | null>(null);
  readonly placeholder = input('');
  /** When set, adds a selectable empty option with this label (value ""), for
   * pickers where "none" is valid — e.g. a top-level category. The product
   * editor leaves it null so a category stays required. */
  readonly emptyLabel = input<string | null>(null);
  /** Accessible name for the field (the visible label sits outside). */
  readonly ariaLabel = input('');
  readonly valueChange = output<string>();

  protected readonly options = computed(() =>
    flattenCategoryTree(this.categories()).map((n) => ({
      id: n.category.id,
      name: n.category.name,
      depth: n.depth,
    })),
  );

  protected indent(depth: number): string {
    return '   '.repeat(depth);
  }

  protected onChange(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }
}
