import { Component, computed, inject, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DigitMask } from './digit-mask';
import { FieldLabel } from './field-label';
import { FieldPrefix } from './field-prefix';
import { Input } from './input';

/**
 * `format` carries a `{example}` placeholder, filled from the deployment's own
 * `companyIdInput.example` — a deployment's number format is only explicable in
 * its own terms, so the hint shows a real one rather than describing a pattern.
 */
export interface CompanyIdFieldText {
  readonly required: string;
  readonly format: string;
}

/**
 * The company registration number, on the registration form and in the staff
 * editor. Same shape as PhoneField: a fixed prefix the visitor never types, an
 * optional digit mask, and one message per way of being wrong.
 *
 * The format hint is shown *before* anything goes wrong as well as after,
 * because unlike a phone number nobody knows their registration number's shape
 * by heart — and it is the same sentence either way, in grey or in red.
 */
@Component({
  selector: 'app-company-id-field',
  imports: [ReactiveFormsModule, DigitMask, FieldLabel, FieldPrefix, Input],
  // See PhoneField: a custom element is inline by default, and an inline box
  // drops the vertical margin a form's `space-y-*` puts on it.
  host: { class: 'block' },
  template: `
    <label [for]="inputId()" appFieldLabel>
      {{ label() }}
      <span class="text-accent" aria-hidden="true">*</span>
    </label>

    <div class="flex">
      @if (prefix) {
        <span appFieldPrefix>{{ prefix }}</span>
      }
      @if (mask; as digitMask) {
        <input
          [id]="inputId()"
          type="text"
          appDigitMask
          [mask]="digitMask"
          [formControl]="control()"
          inputmode="numeric"
          autocomplete="off"
          aria-required="true"
          appInput
          class="w-full"
          [class.rounded-l-none]="!!prefix"
          [attr.aria-invalid]="invalid() || null"
        />
      } @else {
        <input
          [id]="inputId()"
          type="text"
          [formControl]="control()"
          autocomplete="off"
          aria-required="true"
          appInput
          class="w-full"
          [class.rounded-l-none]="!!prefix"
          [attr.aria-invalid]="invalid() || null"
        />
      }
    </div>

    @if (invalid()) {
      <p class="mt-1 text-sm text-red-600">
        {{ control().hasError('required') ? text().required : hint() }}
      </p>
    } @else if (example) {
      <p class="mt-1 text-sm text-muted">{{ hint() }}</p>
    }
  `,
})
export class CompanyIdField {
  readonly control = input.required<FormControl<string>>();
  readonly label = input.required<string>();
  readonly text = input.required<CompanyIdFieldText>();

  /** Whether the form's FieldErrors says this field's message is due. */
  readonly invalid = input(false);
  readonly inputId = input('companyRegistrationId');

  private readonly config = inject(DEPLOYMENT_CONFIG).companyIdInput;
  // Read out once: the template narrows each optional access otherwise, and
  // `config?.x` inside a block that already tested it trips NG8107.
  protected readonly prefix = this.config?.prefix;
  protected readonly mask = this.config?.mask;
  protected readonly example = this.config?.example;

  /** The format hint, worded from the deployment's own example. */
  protected readonly hint = computed(() =>
    this.example
      ? this.text().format.replace('{example}', this.example)
      : this.text().required,
  );
}
