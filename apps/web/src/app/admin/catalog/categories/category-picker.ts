import { Component, computed, input, output } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { AdminCategory } from '@b2b-catalog-platform/shared/admin/catalog';
import { FieldBinding } from '@b2b-catalog-platform/ui/fields/field-binding';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { SelectInput } from '@b2b-catalog-platform/ui/inputs/select-input';
import { flattenCategoryTree } from './category-tree';

/**
 * A native <select> over the category tree, indented by depth. Given a
 * `field` it is that field's control; otherwise it takes `value` and emits
 * `valueChange`.
 */
@Component({
  selector: 'app-category-picker',
  imports: [FormField, FieldBinding, Input, SelectInput],
  template: `
    <ui-select-input>
      @if (field(); as field) {
        <!-- No [selected] here: the field sets the select's value itself. -->
        <select uiInput class="w-full" [formField]="field">
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
          uiInput
          class="w-full"
          [attr.aria-label]="ariaLabel() || placeholder()"
          (change)="onChange($event)"
        >
          @if (emptyLabel() !== null) {
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
    </ui-select-input>
  `,
})
export class CategoryPicker {
  readonly categories = input.required<readonly AdminCategory[]>();
  readonly field = input<FieldTree<string>>();
  readonly value = input<string | null>(null);
  readonly placeholder = input('');
  /** A selectable empty option, where "none" is valid (a top-level category).
   * Null keeps a choice required. */
  readonly emptyLabel = input<string | null>(null);
  /** Outside a Field, where the visible label sits apart. */
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
    // No-break spaces: an option collapses ordinary ones.
    return '   '.repeat(depth);
  }

  protected onChange(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }
}
