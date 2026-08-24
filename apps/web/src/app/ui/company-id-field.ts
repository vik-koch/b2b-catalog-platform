import { Component, inject, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { FieldLabel } from './field-label';
import { Input } from './input';

/**
 * The two things that can be wrong with a registration number, and the hint
 * under the field. Passed in rather than read from app-text, because the field
 * appears on both sides of the app-text/admin-text split (the register form and
 * the staff editor).
 *
 * `{examples}` in `format` and `hint` is substituted with the shapes this
 * deployment accepts.
 */
export interface CompanyIdFieldText {
  readonly format: string;
  /** Only where the field is required — an address's number is optional. */
  readonly required?: string;
  readonly hint?: string;
}

/**
 * The one registration-number field: a plain text input measured against every
 * shape the deployment accepts.
 *
 * What is typed is what is stored, normalized by the contract (spaces out,
 * upper case), so a number copied off a letterhead is accepted as written.
 */
@Component({
  selector: 'app-company-id-field',
  imports: [ReactiveFormsModule, FieldLabel, Input],
  // A block, like every other field: a custom element is inline by default, and
  // an inline box drops the vertical margin a form's `space-y-*` puts on it.
  host: { class: 'block' },
  template: `
    <label [for]="inputId()" appFieldLabel>
      {{ label() }}
      @if (required()) {
        <span class="text-accent" aria-hidden="true">*</span>
      } @else if (optionalLabel()) {
        <span class="font-normal text-subtle">({{ optionalLabel() }})</span>
      }
    </label>

    <input
      [id]="inputId()"
      type="text"
      [formControl]="control()"
      autocomplete="off"
      appInput
      class="w-full"
      [attr.aria-required]="required() || null"
      [attr.aria-invalid]="invalid() || null"
    />

    @if (invalid()) {
      <p class="mt-1 text-sm text-red-600">{{ message() }}</p>
    } @else if (hint()) {
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
  readonly required = input(true);
  readonly optionalLabel = input<string>();
  readonly inputId = input('companyId');

  private readonly formats =
    inject(DEPLOYMENT_CONFIG).companyIdInput?.formats ?? [];

  /**
   * Every accepted shape, in one list. The field asks for a number, not for a
   * kind of number, so the hint and the message name all of them rather than
   * whichever one a picker happened to be on.
   */
  private readonly examples = this.formats
    .map((format) => format.example)
    .join(', ');

  protected hint(): string | undefined {
    return this.examples
      ? this.text().hint?.replace('{examples}', this.examples)
      : this.text().hint;
  }

  /**
   * A method rather than a computed: a FormControl's error state is not a
   * signal, so a computed would cache the first message it produced. The view
   * is re-rendered when `invalid` flips, which is exactly when this changes.
   */
  protected message(): string {
    const text = this.text();
    return this.control().hasError('required') && text.required
      ? text.required
      : text.format.replace('{examples}', this.examples);
  }
}
