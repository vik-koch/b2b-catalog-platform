import { Component, inject, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { applyMask, CompanyIdFormat } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DigitMask } from './digit-mask';
import { FieldLabel } from './field-label';
import { FieldPrefix } from './field-prefix';
import { Input } from './input';
import { SelectField } from './select-field';

/**
 * `format` carries a `{example}` placeholder, filled from the chosen format's
 * own `example` — a registration number's shape is only explicable in its own
 * terms, so the hint shows a real one rather than describing a pattern.
 */
export interface CompanyIdFieldText {
  readonly required: string;
  readonly format: string;
  /** Names the picker. Only reached where several formats are configured. */
  readonly formatLabel?: string;
}

/**
 * The company registration number, on the registration form and in the staff
 * editor.
 *
 * A jurisdiction can accept more than one shape, and the shapes disagree about
 * everything the field is made of: how long the number is, whether it carries a
 * prefix, how it groups. Rather than average them into one permissive text box,
 * the field **asks which one first** — the picker's answer decides the prefix,
 * the mask and the hint, and the form validates against that format's pattern.
 *
 * With a single configured format there is nothing to ask, so no picker is
 * drawn and the field looks exactly as it did before there were several.
 *
 * The chosen format lives in the form (`formatControl`), not here: it decides
 * which rule the control is validated against and how the typed value is
 * composed on submit, so the form is where it has to be visible.
 */
@Component({
  selector: 'app-company-id-field',
  imports: [
    ReactiveFormsModule,
    DigitMask,
    FieldLabel,
    FieldPrefix,
    Input,
    SelectField,
  ],
  // See PhoneField: a custom element is inline by default, and an inline box
  // drops the vertical margin a form's `space-y-*` puts on it.
  host: { class: 'block' },
  template: `
    <label [for]="inputId()" appFieldLabel>
      {{ label() }}
      <span class="text-accent" aria-hidden="true">*</span>
    </label>

    @if (formats.length > 1) {
      <app-select-field class="mb-2 w-full sm:w-72">
        <!-- Selection is marked on the option rather than bound on the
             <select>, as everywhere else in the app: a property binding on the
             element races the @for that fills it. -->
        <select
          appInput
          class="w-full"
          (change)="chooseFormat($event)"
          [attr.aria-label]="text().formatLabel"
        >
          @for (option of formats; track option.key) {
            <option
              [value]="option.key"
              [selected]="option.key === formatKey()"
            >
              {{ option.label }}
            </option>
          }
        </select>
      </app-select-field>
    }

    <div class="flex">
      @if (format()?.prefix; as prefix) {
        <span appFieldPrefix>{{ prefix }}</span>
      }
      <!-- Two inputs rather than one with a bound mask: DigitMask is a value
           accessor, and swapping it in and out under a live control is not
           something a directive can do. The pair is keyed by whether the
           chosen format groups its digits, so switching format re-creates the
           right one. -->
      @if (format()?.mask; as mask) {
        <input
          [id]="inputId()"
          type="text"
          appDigitMask
          [mask]="mask"
          [formControl]="control()"
          inputmode="numeric"
          autocomplete="off"
          aria-required="true"
          appInput
          class="w-full"
          [class.rounded-l-none]="!!format()?.prefix"
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
          [class.rounded-l-none]="!!format()?.prefix"
          [attr.aria-invalid]="invalid() || null"
        />
      }
    </div>

    @if (invalid()) {
      <p class="mt-1 text-sm text-red-600">
        {{ control().hasError('required') ? text().required : hint() }}
      </p>
    } @else if (format()?.example) {
      <p class="mt-1 text-sm text-muted">{{ hint() }}</p>
    }
  `,
})
export class CompanyIdField {
  readonly control = input.required<FormControl<string>>();
  /** Holds the chosen format's `key`. */
  readonly formatControl = input.required<FormControl<string>>();
  readonly label = input.required<string>();
  readonly text = input.required<CompanyIdFieldText>();

  /** Whether the form's FieldErrors says this field's message is due. */
  readonly invalid = input(false);
  readonly inputId = input('companyRegistrationId');

  protected readonly formats: readonly CompanyIdFormat[] =
    inject(DEPLOYMENT_CONFIG).companyIdInput?.formats ?? [];

  /**
   * Methods rather than computeds: a FormControl's value is not a signal, so a
   * computed would cache the format the field was first drawn with. The view
   * re-renders on the picker's own change event, which is when this moves.
   */
  protected formatKey(): string {
    return this.formatControl().value;
  }

  /**
   * The format the field is currently dressed as. `undefined` when the key
   * names none — a deployment with no formats at all, or a stored number from
   * before the current config, which is then shown unmasked and unprefixed so
   * that merely looking at it cannot truncate it.
   */
  protected format(): CompanyIdFormat | undefined {
    return this.formats.find((option) => option.key === this.formatKey());
  }

  /** The format hint, worded from the chosen format's own example. */
  protected hint(): string {
    const example = this.format()?.example;
    return example
      ? this.text().format.replace('{example}', example)
      : this.text().required;
  }

  /**
   * Switching format re-types the number in the new shape: the digits are kept
   * and regrouped, and anything the new mask has no room for is dropped — in
   * front of the visitor, which is the part that matters. A format without a
   * mask is left alone, because it may accept more than digits.
   */
  protected chooseFormat(event: Event): void {
    const key = (event.target as HTMLSelectElement).value;
    this.formatControl().setValue(key);

    const mask = this.formats.find((option) => option.key === key)?.mask;
    if (mask) {
      this.control().setValue(applyMask(this.control().value, mask));
    }
  }
}
