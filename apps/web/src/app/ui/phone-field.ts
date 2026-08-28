import { Component, inject, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DigitMask } from './digit-mask';
import { FieldLabel } from './field-label';
import { FieldPrefix } from './field-prefix';
import { Input } from './input';

/**
 * The two things that can be wrong with a phone number. Passed in rather than
 * read from app-text, because the same field appears on both sides of the
 * app-text/admin-text split (see the register form and the staff editor).
 */
export interface PhoneFieldText {
  readonly incomplete: string;
  /** Only where the field is required — the staff editor has no such wording. */
  readonly required?: string;
}

/**
 * The one phone field: label, the deployment's country code, its digit mask,
 * and the message for whichever of the two rules was broken.
 *
 * It existed in four copies — registration, the account editor, the staff
 * editor and the inquiry form — which is how the four came to disagree about
 * `autocomplete`, about `aria-required`, and about whether an incomplete number
 * is worth a message. The control and the error *visibility* stay with the
 * form, because only the form knows what its FieldErrors has revealed; the
 * markup and the wiring to deployment config live here.
 *
 * A deployment with no `phoneInput` gets a plain text field: with no country
 * code there is no national part to mask, and digits-only would mangle a number
 * written the way its own country writes it.
 */
@Component({
  selector: 'app-phone-field',
  imports: [ReactiveFormsModule, DigitMask, FieldLabel, FieldPrefix, Input],
  // A block, like every other field: a custom element is inline by default, and
  // an inline box drops the vertical margin a form's `space-y-*` puts on it.
  host: { class: 'block' },
  template: `
    <label [for]="inputId()" appFieldLabel>
      {{ label() }}
      @if (required() && marker()) {
        <span class="text-accent" aria-hidden="true">*</span>
      }
    </label>

    @if (config; as phone) {
      <div class="flex">
        <span appFieldPrefix>{{ phone.countryCode }}</span>
        <input
          [id]="inputId()"
          type="tel"
          appDigitMask
          [mask]="phone.mask ?? ''"
          [prefix]="phone.countryCode"
          [formControl]="control()"
          [autocomplete]="autocomplete()"
          inputmode="tel"
          appInput
          class="w-full rounded-l-none"
          [attr.aria-required]="required() || null"
          [attr.aria-invalid]="invalid() || null"
        />
      </div>
    } @else {
      <input
        [id]="inputId()"
        type="tel"
        [formControl]="control()"
        [autocomplete]="autocomplete()"
        appInput
        class="w-full"
        [attr.aria-required]="required() || null"
        [attr.aria-invalid]="invalid() || null"
      />
    }

    @if (invalid()) {
      <p class="mt-1 text-sm text-red-600">{{ message() }}</p>
    }
  `,
})
export class PhoneField {
  readonly control = input.required<FormControl<string>>();
  readonly label = input.required<string>();
  readonly text = input.required<PhoneFieldText>();

  /** Whether the form's FieldErrors says this field's message is due. */
  readonly invalid = input(false);
  readonly required = input(false);
  /**
   * The `*` beside the label. Suppressed on a form where *everything* is
   * required — marking every field marks none of them.
   */
  readonly marker = input(true);
  readonly inputId = input('phone');
  /**
   * `tel` where the visitor is filling in their own number, `off` in the staff
   * editor — a manager typing a customer's number does not want their own.
   */
  readonly autocomplete = input('tel');

  protected readonly config = inject(DEPLOYMENT_CONFIG).phoneInput;

  /**
   * A method rather than a computed: a FormControl's error state is not a
   * signal, so a computed would cache the first message it produced. The view
   * is re-rendered when `invalid` flips, which is exactly when this changes.
   */
  protected message(): string {
    const text = this.text();
    return this.control().hasError('required')
      ? (text.required ?? text.incomplete)
      : text.incomplete;
  }
}
