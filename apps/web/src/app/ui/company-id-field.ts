import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { CompanyIdFormat } from '@b2b-catalog-platform/shared';
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
  /** Replaces the format example under the field, where the caller has
   * something more useful to say — e.g. when the number is needed at all. */
  readonly hint?: string;
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
      @if (required()) {
        <span class="text-accent" aria-hidden="true">*</span>
      } @else if (optionalLabel(); as optional) {
        <span class="font-normal text-subtle">({{ optional }})</span>
      }
    </label>

    <!-- Two columns at every width, never a stack that splits at a breakpoint:
         the shape and the number are one answer given in two parts, and the
         picker read as a separate question of its own when it sat on a line by
         itself. Narrow screens keep the pair rather than collapsing it,
         because a mask that changes under you is worth seeing the cause of. -->
    <div [class]="formats.length > 1 ? 'grid gap-6 sm:grid-cols-2' : ''">
      @if (formats.length > 1) {
        <app-select-field>
          <!-- Selection is marked on the option rather than bound on the
               <select>, as everywhere else in the app: a property binding on
               the element races the @for that fills it. -->
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
             chosen format groups its digits, so switching format re-creates
             the right one. -->
        @if (format()?.mask; as mask) {
          <input
            [id]="inputId()"
            type="text"
            appDigitMask
            [mask]="mask"
            [formControl]="control()"
            inputmode="numeric"
            autocomplete="off"
            [attr.aria-required]="required() || null"
            appInput
            class="w-full min-w-0"
            [class.rounded-l-none]="!!format()?.prefix"
            [attr.aria-invalid]="invalid() || null"
          />
        } @else {
          <input
            [id]="inputId()"
            type="text"
            [formControl]="control()"
            autocomplete="off"
            [attr.aria-required]="required() || null"
            appInput
            class="w-full min-w-0"
            [class.rounded-l-none]="!!format()?.prefix"
            [attr.aria-invalid]="invalid() || null"
          />
        }
      </div>
    </div>

    @if (invalid()) {
      <p class="mt-1 text-sm text-red-600">
        {{ control().hasError('required') ? text().required : hint() }}
      </p>
    } @else if (hintText(); as extra) {
      <p class="mt-1 text-sm text-muted">{{ extra }}</p>
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
  /**
   * Required on registration, where the number is what identifies a company;
   * optional on an address, where it describes the party being invoiced and an
   * address invoiced to a natural person has none.
   */
  readonly required = input(true);
  /** The word for "optional", where the field is. Wording is the caller's. */
  readonly optionalLabel = input<string | undefined>(undefined);

  protected readonly formats: readonly CompanyIdFormat[] =
    inject(DEPLOYMENT_CONFIG).companyIdInput?.formats ?? [];

  /**
   * The chosen format's key, mirrored into a signal.
   *
   * The picker writes to a FormControl, and a FormControl's value is not
   * reactive: read through a plain method, the mask and the prefix would only
   * be re-read when something *else* happened to re-render this view. A form
   * that sets the format and the number together — which is how every editor
   * seeds this field — would then keep the shape the field was first drawn
   * with, and mask a ten-digit number into a five-digit box. Following the
   * control's own stream is what makes the field move with it.
   */
  protected readonly formatKey = signal('');

  constructor() {
    effect((onCleanup) => {
      const control = this.formatControl();
      this.formatKey.set(control.value);
      const subscription = control.valueChanges.subscribe((key: string) =>
        this.formatKey.set(key),
      );
      onCleanup(() => subscription.unsubscribe());
    });
  }

  /**
   * The format the field is currently dressed as. `undefined` when the key
   * names none — a deployment with no formats at all, or a stored number from
   * before the current config, which is then shown unmasked and unprefixed so
   * that merely looking at it cannot truncate it.
   */
  protected readonly format = computed<CompanyIdFormat | undefined>(() =>
    this.formats.find((option) => option.key === this.formatKey()),
  );

  /**
   * What sits under the field when nothing is wrong: the caller's own note
   * where it has one — an address says when the number is needed at all — and
   * otherwise the format's example.
   */
  protected hintText(): string | undefined {
    return (
      this.text().hint ?? (this.format()?.example ? this.hint() : undefined)
    );
  }

  /** The format hint, worded from the chosen format's own example. */
  protected hint(): string {
    const example = this.format()?.example;
    return example
      ? this.text().format.replace('{example}', example)
      : this.text().required;
  }

  /**
   * Switching the kind of number **clears** it. The shapes are different
   * numbers, not different spellings of one: a ten-digit registration number
   * regrouped into a five-digit mask is not a shorter version of itself, it is
   * a different number that happens to start the same way — and one saved from
   * a half-kept value is wrong in a way nothing downstream can detect. An empty
   * field says plainly that the answer has to be given again.
   */
  protected chooseFormat(event: Event): void {
    this.formatControl().setValue((event.target as HTMLSelectElement).value);
    this.control().setValue('');
  }
}
