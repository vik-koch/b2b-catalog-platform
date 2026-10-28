import { Directive, inject } from '@angular/core';
import { SuggestField } from './suggest-field';

/**
 * The input half of SuggestField: the combobox role and its wiring, and the
 * keys. Value binding stays the caller's (FormField, or `[value]`).
 */
@Directive({
  selector: 'input[uiSuggestInput]',
  host: {
    type: 'text',
    role: 'combobox',
    'aria-autocomplete': 'list',
    '[attr.aria-expanded]': 'field.list().panelOpen()',
    '[attr.aria-controls]': 'field.listId',
    '[attr.aria-activedescendant]': 'field.activeOptionId()',
    '(input)': 'typed($event)',
    '(keydown)': 'field.keydown($event)',
    '(blur)': 'field.list().close()',
  },
})
export class SuggestInput {
  protected readonly field = inject(SuggestField);

  protected typed(event: Event): void {
    this.field.list().type((event.target as HTMLInputElement).value);
  }
}
