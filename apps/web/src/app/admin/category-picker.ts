import { Component, computed, input, output } from '@angular/core';
import { AdminCategory } from '@b2b-catalog-platform/shared';
import { LucideIcon } from '../ui/icons/lucide-icon';

interface Option {
  id: string;
  name: string;
  depth: number;
}

/** Orders a flat category list depth-first so the <select> can indent by depth. */
function ordered(categories: readonly AdminCategory[]): Option[] {
  const byParent = new Map<string | null, AdminCategory[]>();
  for (const c of categories) {
    const siblings = byParent.get(c.parentId) ?? [];
    siblings.push(c);
    byParent.set(c.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }
  const out: Option[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ id: c.id, name: c.name, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/**
 * Single-select category picker for the product editor: a native <select> whose
 * options are the category tree flattened depth-first and indented by depth. A
 * product belongs to exactly one category (the `categoryId` FK).
 */
@Component({
  selector: 'app-category-picker',
  imports: [LucideIcon],
  template: `
    <div class="relative">
      <select
        class="w-full appearance-none rounded-md border border-stone-300 py-2 pr-10 pl-3 focus:border-primary focus:outline-none"
        [attr.aria-label]="ariaLabel() || placeholder()"
        (change)="onChange($event)"
      >
        <option value="" disabled [selected]="!value()">
          {{ placeholder() }}
        </option>
        @for (o of options(); track o.id) {
          <option [value]="o.id" [selected]="o.id === value()">
            {{ indent(o.depth) }}{{ o.name }}
          </option>
        }
      </select>
      <app-lucide-icon
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
  /** Accessible name for the field (the visible label sits outside). */
  readonly ariaLabel = input('');
  readonly valueChange = output<string>();

  protected readonly options = computed(() => ordered(this.categories()));

  protected indent(depth: number): string {
    return '   '.repeat(depth);
  }

  protected onChange(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }
}
