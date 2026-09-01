import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { AddressComponents, fillText } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { FieldErrors } from '../core/form-errors';
import { FieldLabel } from '../ui/field-label';
import { DigitMask } from '../ui/digit-mask';
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
    DigitMask,
    FieldLabel,
    Input,
    SelectField,
  ],
  host: { class: 'block' },
  template: `
    <!-- A container, for the suggestion panel under the street: it is allowed
         to be wider than its own field, but never wider than the form it
         drops into. -->
    <div class="@container space-y-4" [formGroup]="form().group">
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

      <!-- Collapsed, the street and what is inside the building are the whole
           of what is being typed, so they share a row — the second field in
           the column the postcode occupies once the fields are opened out, so
           neither state redraws the other's grid. Expanded, they stack: there
           are four more fields under them and a row of two would be the odd
           one out. -->
      <div [class]="streetRow()">
        <div>
          <app-address-suggest-field
            (focusout)="settleStreet()"
            [control]="form().group.controls.street"
            [label]="collapsed() ? text.addressLine : text.street"
            [text]="suggestText"
            [country]="form().group.controls.country.value"
            [invalid]="isInvalid('street')"
            (picked)="suggested($event)"
          />
          @if (isInvalid('street')) {
            <p class="mt-1 text-sm text-red-600">{{ text.required }}</p>
          }
          <!-- What the provider filled in, read back. Not an aside: it is most
               of the address, and the customer is the only one who can say it
               is wrong. -->
          @if (collapsed() && filled()) {
            <p class="mt-1 text-sm text-muted">{{ filled() }}</p>
          }
        </div>

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
      </div>

      <!-- Kept in the page while collapsed rather than dropped from it, and
           moved off-screen instead. Browser autofill fills a form field it can
           see in the DOM; a postcode and a city that are not there are simply
           not filled, and the customer who let the browser type the address
           got the street line alone. Off-screen they are filled like any
           other, and the read-back above prints what landed in them.

           Taken out of the tab order and hidden from assistive technology
           while they are off-screen. Saying that with inert, or with a
           display of none, would be tidier — and both are also how a browser
           decides a field is not worth filling. -->
      <div [class]="restClass()" [attr.aria-hidden]="collapsed() || null">
        <div class="grid gap-6 sm:grid-cols-[10rem_1fr]">
          <div>
            <label [for]="id('postalCode')" appFieldLabel>
              {{ text.postalCode }}
              <span class="text-accent" aria-hidden="true">*</span>
            </label>
            <!-- Two fields, one drawn at a time: the mask is a
                 ControlValueAccessor, and an empty mask means "digits only,
                 no limit" — which would quietly strip the letters out of a
                 code in a country whose codes carry them. So a deployment
                 that configured a digit mask gets a field that enforces it,
                 and everyone else gets a field that takes what is typed. -->
            @if (postalMask(); as mask) {
              <input
                [id]="id('postalCode')"
                type="text"
                inputmode="numeric"
                formControlName="postalCode"
                autocomplete="postal-code"
                aria-required="true"
                [attr.tabindex]="collapsed() ? -1 : null"
                appInput
                appDigitMask
                [mask]="mask"
                class="w-full"
                [attr.aria-invalid]="isInvalid('postalCode') || null"
              />
            } @else {
              <input
                [id]="id('postalCode')"
                type="text"
                formControlName="postalCode"
                autocomplete="postal-code"
                aria-required="true"
                [attr.tabindex]="collapsed() ? -1 : null"
                appInput
                class="w-full"
                [attr.aria-invalid]="isInvalid('postalCode') || null"
              />
            }
            @if (isInvalid('postalCode')) {
              <p class="mt-1 text-sm text-red-600">
                {{ postalCodeError() }}
              </p>
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
              [attr.tabindex]="collapsed() ? -1 : null"
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
            [attr.tabindex]="collapsed() ? -1 : null"
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
                [attr.tabindex]="collapsed() ? -1 : null"
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
      </div>

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
  /** Opened from outside: the page found the address wanting and the fields
   * that are wrong are the ones this is folding away. */
  readonly reveal = input(false);

  /** A provider filled the address in. The page hears about it because a
   * delivery address that moves re-resolves its zone. */
  readonly picked = output<AddressComponents>();

  /** Once the fields are open they stay open: a form that folded itself back
   * up after being corrected would hide the correction. */
  private readonly expanded = signal(false);

  constructor() {
    // Mirrors the group into a signal, and follows the input if the page ever
    // hands over a different form.
    effect((onCleanup) => {
      const group = this.form().group;
      const read = () => this.value.set({ ...group.getRawValue() });
      read();
      const sub = group.valueChanges.subscribe(read);
      onCleanup(() => sub.unsubscribe());
    });

    effect(() => {
      if (this.reveal()) this.expand();
    });
  }

  protected readonly collapsed = computed(
    () => this.compact() && !this.expanded(),
  );

  /** The street and address line 2 side by side while the rest is collapsed,
   * stacked once every field is on screen. The narrow column is the postcode's
   * own, so the two states line up. */
  protected readonly streetRow = computed(() =>
    this.collapsed() ? 'grid gap-6 sm:grid-cols-2' : 'grid gap-6',
  );

  /** Where the rest of the fields sit. Off to the left of the page while the
   * form is collapsed — still laid out, still fillable, just nowhere anyone
   * can see them. Left rather than up: a page does not scroll to what is
   * beyond its left edge. */
  protected readonly restClass = computed(() =>
    this.collapsed()
      ? 'absolute -left-[9999px] top-0 w-80 space-y-4'
      : 'space-y-4',
  );

  /**
   * What the form is holding, as a signal. A `FormControl` is not one, so a
   * computed reading `getRawValue()` depends on nothing and caches the first
   * answer it ever gave — which is an empty address, forever.
   */
  private readonly value = signal(this.blank());

  /** The parts a suggestion filled, on one line — everything the street line
   * does not already say. The street is in the field directly above it, and
   * printing it twice is not a read-back. */
  protected readonly filled = computed(() => {
    const value = this.value();
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

  /**
   * Leaving the street field with nothing resolved behind it opens the rest.
   * A pick fills the postcode before the blur — the list commits on mousedown
   * — so a suggestion that landed leaves this alone, and one that never came
   * leaves a customer who would otherwise have a postcode-shaped hole in an
   * address they cannot see.
   */
  protected settleStreet(): void {
    const { street, postalCode } = this.value();
    if (this.collapsed() && street.trim() && !postalCode.trim()) {
      this.expand();
    }
  }

  private blank() {
    return { street: '', postalCode: '', city: '', region: '' };
  }

  protected id(field: string): string {
    return `address-${this.instance}-${field}`;
  }

  /**
   * The digit mask the chosen country's codes are entered through, where the
   * deployment configured one. Read off the mirrored value rather than the
   * control, so switching country regroups the field immediately.
   */
  protected readonly postalMask = computed(() => this.rule()?.mask ?? '');

  /** Reads the country through the mirrored value, so it is a signal. */
  private readonly rule = computed(() => {
    this.value();
    return this.form().postalCodeRule();
  });

  /**
   * Why the postcode is refused: empty is one answer and the wrong shape is
   * another, and telling somebody who left it blank what a valid code looks
   * like is answering a question they did not ask.
   */
  protected postalCodeError(): string {
    const control = this.form().group.controls.postalCode;
    const rule = this.rule();
    return control.hasError('postalCode') && rule
      ? fillText(this.text.postalCodeFormat, { example: rule.example })
      : this.text.required;
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
