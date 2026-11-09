import { Component, inject, input, output } from '@angular/core';

import { ORDER_NOTE_MAX } from '@b2b-catalog-platform/shared/core/ordering';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { AutoGrow } from '@b2b-catalog-platform/ui/inputs/auto-grow';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';

import { SHARED_TEXT } from '../../../../platform/config/shared-text';
import { STOREFRONT_ORDERING_TEXT } from '../../ordering-text';

/** The order's note for the manager; per-line notes (FR-CART-08) are separate.
 * Capped at the contract's length rather than truncated by the server. */
@Component({
  selector: 'app-order-note',
  imports: [AutoGrow, FieldLabel, Input],
  host: { class: 'block' },
  template: `
    <label [for]="id" uiFieldLabel>
      {{ text.label }}
      <span class="font-normal text-ink-subtle">({{ optional }})</span>
    </label>
    <textarea
      [id]="id"
      rows="3"
      [attr.maxlength]="maxLength"
      [value]="note() ?? ''"
      [attr.placeholder]="text.placeholder"
      uiInput
      uiAutoGrow
      class="w-full"
      (input)="typed($event)"
    ></textarea>
  `,
})
export class OrderNote {
  protected readonly text = inject(STOREFRONT_ORDERING_TEXT).checkout.note;
  protected readonly optional = inject(SHARED_TEXT).optional;
  protected readonly id = 'order-note';
  protected readonly maxLength = ORDER_NOTE_MAX;

  readonly note = input.required<string | null>();

  readonly noteChange = output<string | null>();

  protected typed(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.noteChange.emit(value.trim() ? value : null);
  }
}
