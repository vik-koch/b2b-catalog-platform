import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { AddressComponents } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { FieldErrors } from '../core/form-errors';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { SelectField } from '../ui/select-field';
import { AddressForm } from './address-form';
import { AddressSuggestField } from './address-suggest-field';

/** Ids have to be unique per instance: checkout draws two of these on one
 * page, and a label pointing at the wrong form's city is worse than none. */
let nextId = 0;

/**
 * The fields an address is made of, drawn wherever one is entered — the
 * account's editor and both pickers at checkout. One vocabulary and one
 * layout, so an address does not read as a different thing depending on where
 * it is being typed.
 *
 * It draws a group it is handed; it does not own one. Validity, submission and
 * what a refusal means all belong to the page.
 *
 * `label` is drawn only where there is a book to file the address under: at
 * checkout an address is named by its own street line, and inventing a word
 * for it is a question asked for nothing.
 *
 * Where the deployment has a suggestion provider, `compact` asks for the
 * street alone and lets a pick fill the postcode, the city and the region —
 * shown back as text, because a provider is an accelerator and never an
 * authority, and an address nobody can read is one nobody can check. The full
 * fields are always one link away, so a provider that is down or silent costs
 * a click rather than the order.
 */
@Component({
  selector: 'app-address-fields',
  imports: [
    ReactiveFormsModule,
    AddressSuggestField,
    FieldLabel,
    Input,
    SelectField,
  ],
  host: { class: 'block' },
  template: `
    <div class="space-y-6" [formGroup]="form().group">
      @if (showLabel()) {
        <div>
          <label [for]="id('label')" appFieldLabel>
            {{ text.label }}
            <span class="font-normal text-subtle">({{ text.optional }})</span>
          </label>
          <input
            [id]="id('label')"
            type="text"
            formControlName="label"
            appInput
            class="w-full"
          />
          <p class="mt-1 text-sm text-muted">{{ text.labelHint }}</p>
        </div>
      }

      <app-address-suggest-field
        [control]="form().group.controls.street"
        [label]="text.street"
        [text]="suggestText"
        [country]="form().group.controls.country.value"
        [invalid]="isInvalid('street')"
        (picked)="suggested($event)"
      />
      @if (isInvalid('street')) {
        <p class="-mt-4 text-sm text-red-600">{{ text.required }}</p>
      }

      <!-- What the provider filled in, read back. Not an aside: it is most of
           the address, and the customer is the only one who can say it is
           wrong. -->
      @if (collapsed() && filled()) {
        <p class="-mt-4 text-sm text-muted">{{ filled() }}</p>
      }

      <div>
        <label [for]="id('street2')" appFieldLabel>
          {{ text.street2 }}
          <span class="font-normal text-subtle">({{ text.optional }})</span>
        </label>
        <input
          [id]="id('street2')"
          type="text"
          formControlName="street2"
          autocomplete="address-line2"
          appInput
          class="w-full"
        />
      </div>

      @if (!collapsed()) {
        <div class="grid gap-6 sm:grid-cols-[10rem_1fr]">
          <div>
            <label [for]="id('postalCode')" appFieldLabel>
              {{ text.postalCode }}
              <span class="text-accent" aria-hidden="true">*</span>
            </label>
            <input
              [id]="id('postalCode')"
              type="text"
              formControlName="postalCode"
              autocomplete="postal-code"
              aria-required="true"
              appInput
              class="w-full"
              [attr.aria-invalid]="isInvalid('postalCode') || null"
            />
            @if (isInvalid('postalCode')) {
              <p class="mt-1 text-sm text-red-600">{{ text.required }}</p>
            }
          </div>

          <div>
            <label [for]="id('city')" appFieldLabel>
              {{ text.city }}
              <span class="text-accent" aria-hidden="true">*</span>
            </label>
            <input
              [id]="id('city')"
              type="text"
              formControlName="city"
              autocomplete="address-level2"
              aria-required="true"
              appInput
              class="w-full"
              [attr.aria-invalid]="isInvalid('city') || null"
            />
            @if (isInvalid('city')) {
              <p class="mt-1 text-sm text-red-600">{{ text.required }}</p>
            }
          </div>
        </div>

        <!-- Always asked for, though rarely typed by hand: a suggestion fills
           it, and what it fills is printed on the address. -->
        <div>
          <label [for]="id('region')" appFieldLabel>
            {{ text.region }}
            <span class="font-normal text-subtle">({{ text.optional }})</span>
          </label>
          <input
            [id]="id('region')"
            type="text"
            formControlName="region"
            autocomplete="address-level1"
            appInput
            class="w-full"
          />
        </div>

        <!-- Nothing to ask where the deployment ships to one country: the single
           configured code is used, and the server still checks it. -->
        @if (countries.length > 1) {
          <div>
            <label [for]="id('country')" appFieldLabel>
              {{ text.country }}
              <span class="text-accent" aria-hidden="true">*</span>
            </label>
            <app-select-field class="max-w-72">
              <select
                [id]="id('country')"
                formControlName="country"
                autocomplete="country"
                appInput
                class="w-full"
              >
                @for (option of countries; track option.code) {
                  <option [value]="option.code">{{ option.label }}</option>
                }
              </select>
            </app-select-field>
          </div>
        }
      }

      <!-- Always on screen, not revealed by a failure: there is then no state
           a customer can be stuck in, and nothing here has to detect one. -->
      @if (collapsed()) {
        <button
          type="button"
          class="cursor-pointer text-sm text-accent hover:underline"
          (click)="expand()"
        >
          {{ text.enterManually }}
        </button>
      }
    </div>
  `,
})
export class AddressFields {
  private readonly instance = nextId++;

  protected readonly text = inject(APP_TEXT).auth.myAccount.addresses;
  protected readonly countries =
    inject(DEPLOYMENT_CONFIG).address?.countries ?? [];

  protected readonly suggestText = {
    suggestionsLabel: this.text.suggestionsLabel,
    noSuggestions: this.text.noSuggestions,
    suggestionCount: this.text.suggestionCount,
  };

  readonly form = input.required<AddressForm>();
  /** Whose `show()` decides which messages are on screen — the page's, because
   * it is the page that knows the form has been submitted. */
  readonly fieldErrors = input.required<FieldErrors>();
  readonly showLabel = input(true);
  /** Ask for the street alone and let a suggestion fill the rest — only where
   * the deployment has a provider to suggest anything. */
  readonly compact = input(false);

  /** A provider filled the address in. The page hears about it because a
   * delivery address that moves re-resolves its zone. */
  readonly picked = output<AddressComponents>();

  /** Once the fields are open they stay open: a form that folded itself back
   * up after being corrected would hide the correction. */
  private readonly expanded = signal(false);

  protected readonly collapsed = computed(
    () => this.compact() && !this.expanded(),
  );

  /** The parts a suggestion filled, on one line — everything the street line
   * does not already say. */
  protected readonly filled = computed(() => {
    const value = this.form().group.getRawValue();
    return [
      [value.postalCode, value.city].filter(Boolean).join(' '),
      value.region,
    ]
      .filter(Boolean)
      .join(', ');
  });

  protected expand(): void {
    this.expanded.set(true);
  }

  protected id(field: string): string {
    return `address-${this.instance}-${field}`;
  }

  protected isInvalid(
    control: keyof AddressForm['group']['controls'],
  ): boolean {
    return this.fieldErrors().show(this.form().group.controls[control]);
  }

  protected suggested(components: AddressComponents): void {
    this.form().applySuggestion(components);
    this.picked.emit(components);
  }
}
