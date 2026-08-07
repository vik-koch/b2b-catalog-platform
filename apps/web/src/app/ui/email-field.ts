import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FieldLabel } from './field-label';
import { Input } from './input';

/**
 * Missing, and malformed. Two messages rather than one because they are two
 * different mistakes: nothing typed, versus something typed that is not an
 * address. Passed in for the same reason as PhoneFieldText — the staff editor
 * words them from admin-text, everything else from app-text.
 */
export interface EmailFieldText {
  readonly required: string;
  readonly invalid: string;
}

/**
 * The one email field. Five forms had their own copy of it (sign-in,
 * registration, the forgotten-password request, the inquiry form and the staff
 * editor), each repeating the same `required ? … : …` message choice.
 *
 * Deliberately *not* here: the validators. The address rule is the shared
 * contract's `emailSchema`, applied through `zodValidator` by the form that
 * owns the control, so client and server keep agreeing on what a valid address
 * is — and so a form like the inquiry can make the field required or not as the
 * visitor changes their preferred channel.
 */
@Component({
  selector: 'app-email-field',
  imports: [ReactiveFormsModule, FieldLabel, Input],
  // See PhoneField: a custom element is inline by default, and an inline box
  // drops the vertical margin a form's `space-y-*` puts on it.
  host: { class: 'block' },
  template: `
    <label [for]="inputId()" appFieldLabel>
      {{ label() }}
      @if (required() && marker()) {
        <span class="text-accent" aria-hidden="true">*</span>
      }
    </label>
    <input
      [id]="inputId()"
      type="email"
      [formControl]="control()"
      [autocomplete]="autocomplete()"
      appInput
      class="w-full"
      [attr.aria-required]="required() || null"
      [attr.aria-invalid]="invalid() || null"
    />
    @if (invalid()) {
      <p class="mt-1 text-sm text-red-600">
        {{ control().hasError('required') ? text().required : text().invalid }}
      </p>
    }
  `,
})
export class EmailField {
  readonly control = input.required<FormControl<string>>();
  readonly label = input.required<string>();
  readonly text = input.required<EmailFieldText>();

  /** Whether the form's FieldErrors says this field's message is due. */
  readonly invalid = input(false);
  readonly required = input(false);
  /** See PhoneField: suppressed where every field on the form is required. */
  readonly marker = input(true);
  readonly inputId = input('email');
  /** `off` in the staff editor: a manager creating an account is not signing in. */
  readonly autocomplete = input('email');
}
