import { Component, computed, input, output } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { AdminCategory } from '@b2b-catalog-platform/shared/admin';
import { FieldBinding } from '../../shared/ui/field-binding';
import { Input } from '../../shared/ui/input';
import { SelectInput } from '../../shared/ui/select-input';
import { flattenCategoryTree } from './category-tree';

/**
 * Single-select category picker for the product editor: a native <select> whose
 * options are the category tree flattened depth-first and indented by depth. A
 * product belongs to exactly one category (the `categoryId` FK).
 *
 * Given a `field`, the select is that field's control inside a Field, which
 * names it and decides what it shows; otherwise it takes a `value` and says
 * `valueChange`.
 */
@Component({
  selector: 'app-category-picker',
  imports: [FormField, FieldBinding, Input, SelectInput],
  template: `
    <app-select-input>
      @if (field(); as field) {
        <!-- No [selected] here: the field sets the select's value itself. -->
        <select appInput class="w-full" [formField]="field">
          @if (emptyLabel() !== null) {
            <option value="">{{ emptyLabel() }}</option>
          } @else {
            <option value="" disabled>{{ placeholder() }}</option>
          }
          @for (o of options(); track o.id) {
            <option [value]="o.id">{{ indent(o.depth) }}{{ o.name }}</option>
          }
        </select>
      } @else {
        <select
          appInput
          class="w-full"
          [attr.aria-label]="ariaLabel() || placeholder()"
          [disabled]="disabled()"
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
      }
    </app-select-input>
  `,
})
export class CategoryPicker {
  readonly categories = input.required<readonly AdminCategory[]>();
  /** The field the select is the control of, where a form holds the value. */
  readonly field = input<FieldTree<string>>();
  readonly value = input<string | null>(null);
  readonly placeholder = input('');
  /** When set, adds a selectable empty option with this label (value ""), for
   * pickers where "none" is valid — e.g. a top-level category. The product
   * editor leaves it null so a category stays required. */
  readonly emptyLabel = input<string | null>(null);
  /** Accessible name for the field (the visible label sits outside). */
  readonly ariaLabel = input('');
  /** Read-only, for a category the shop does not get to choose (FR-ADM-10). */
  readonly disabled = input(false);
  readonly valueChange = output<string>();

  protected readonly options = computed(() =>
    flattenCategoryTree(this.categories()).map((n) => ({
      id: n.category.id,
      name: n.category.name,
      depth: n.depth,
    })),
  );

  protected indent(depth: number): string {
    // No-break spaces: an option collapses ordinary ones.
    return '   '.repeat(depth);
  }

  protected onChange(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }
}
