import { Component, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';

/**
 * A decoy field off screen, never announced and out of the tab order: a person
 * leaves it empty, a bot that fills every input gives itself away.
 *
 *   <ui-honeypot-field controlId="website" [field]="form.website" label="…" />
 */
@Component({
  selector: 'ui-honeypot-field',
  imports: [FormField],
  host: { class: 'absolute left-[-9999px]', 'aria-hidden': 'true' },
  template: `
    <label [for]="controlId()">{{ label() }}</label>
    <input
      [id]="controlId()"
      type="text"
      tabindex="-1"
      autocomplete="off"
      [formField]="field()"
    />
  `,
})
export class HoneypotField {
  readonly field = input.required<FieldTree<string>>();
  readonly controlId = input.required<string>();
  readonly label = input.required<string>();
}
