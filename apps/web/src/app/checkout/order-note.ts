import { Component, inject, input, output } from '@angular/core';
import { ORDER_NOTE_MAX } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { AutoGrow } from '../ui/auto-grow';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';

/**
 * Anything the customer wants to say in words, copied onto the order for the
 * manager who reads it. The last row of the form, because it is the one thing
 * here with no default: everything above arrives answered.
 *
 * Not the per-line note (FR-CART-08) — that describes one product and travels
 * with it. This is about the order.
 *
 * Grows with what is written in it, and stops where the contract does: a note
 * longer than the column would be truncated by the server, which is a worse
 * answer than a field that will not take the character.
 */
@Component({
  selector: 'app-order-note',
  imports: [AutoGrow, FieldLabel, Input],
  host: { class: 'block' },
  template: `
    <label [for]="id" appFieldLabel>
      {{ text.label }}
      <span class="font-normal text-subtle">({{ optional }})</span>
    </label>
    <textarea
      [id]="id"
      rows="3"
      [attr.maxlength]="maxLength"
      [value]="note() ?? ''"
      appInput
      appAutoGrow
      class="w-full"
      (input)="typed($event)"
    ></textarea>
    <p class="mt-1 text-sm text-muted">{{ text.hint }}</p>
  `,
})
export class OrderNote {
  protected readonly text = inject(APP_TEXT).checkout.note;
  protected readonly optional = inject(APP_TEXT).checkout.optional;
  protected readonly id = 'order-note';
  protected readonly maxLength = ORDER_NOTE_MAX;

  readonly note = input.required<string | null>();

  readonly noteChange = output<string | null>();

  protected typed(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.noteChange.emit(value.trim() ? value : null);
  }
}
