import {
  Component,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { AddressComponents } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { SHARED_TEXT } from '../config/shared-text';
import { DigitMask } from '../ui/digit-mask';
import { FIELD_ATTEMPT } from '../ui/field-attempt';
import { Field } from '../ui/field';
import { FieldBinding } from '../ui/field-binding';
import { Input } from '../ui/input';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { SelectInput } from '../ui/select-input';
import { submitAttempt } from '../ui/submit-attempt';
import { AddressForm } from './address-form';
import { AddressSuggestInput } from './address-suggest-input';

/** Ids have to be unique per instance: checkout draws two of these on one
 * page, and a label pointing at the wrong form's city is worse than none. */
let nextId = 0;

/**
 * The fields an address is made of, drawn wherever one is entered: the
 * account's editor and both pickers at checkout. One vocabulary and one
 * layout, so an address does not read as a different thing depending on where
 * it is being typed.
 *
 * It draws an address it is handed; it does not own one. Validity, submission
 * and what a refusal means all belong to the page.
 *
 * `label` is drawn only where there is a book to file the address under: at
 * checkout an address is named by its own street line, and inventing a word
 * for it is a question asked for nothing.
 *
 * Where the deployment has a suggestion provider, `compact` asks for the
 * street alone and lets a pick fill the postcode, the city and the region,
 * shown back as text, because a provider is an accelerator and never an
 * authority, and an address nobody can read is one nobody can check. The full
 * fields are always one link away, so a provider that is down or silent costs
 * a click rather than the order.
 */
@Component({
  selector: 'app-address-fields',
  imports: [
    AddressSuggestInput,
    DigitMask,
    Field,
    FieldBinding,
    FormField,
    Input,
    SelectInput,
    TextButton,
  ],
  host: { class: 'block' },
  // Its own attempt, keyed by the address: where it is the whole form, that is
  // the form's; where it is part of one, the page marks it only while the
  // address is being typed (see FIELD_ATTEMPT).
  providers: [
    { provide: FIELD_ATTEMPT, useExisting: forwardRef(() => AddressFields) },
  ],
  template: `
    @let address = form().field;
    <!-- A container, for the suggestion panel under the street: it is allowed
         to be wider than its own field, but never wider than the form it
         drops into. -->
    <div class="@container space-y-4">
      @if (showLabel()) {
        <app-field
          [field]="address.label"
          [label]="text.label"
          [hint]="text.labelHint"
          [optional]="optional"
          [controlId]="id('label')"
        >
          <input
            type="text"
            appInput
            class="w-full"
            [formField]="address.label"
          />
        </app-field>
      }

      <!-- Collapsed, the street and what is inside the building are the whole
           of what is being typed, so they share a row, the second field in
           the column the postcode occupies once the fields are opened out, so
           neither state redraws the other's grid. Expanded, they stack: there
           are four more fields under them and a row of two would be the odd
           one out. -->
      <div [class]="streetRow()">
        <div (focusout)="settleStreet()">
          <app-field
            [field]="address.street"
            [label]="collapsed() ? text.addressLine : text.street"
            [controlId]="id('street')"
          >
            <app-address-suggest-input
              [field]="address.street"
              [text]="suggestText"
              [country]="address.country().value()"
              (picked)="suggested($event)"
            />
          </app-field>
          <!-- What the provider filled in, read back. Not an aside: it is most
               of the address, and the customer is the only one who can say it
               is wrong. -->
          @if (collapsed() && filled()) {
            <p class="mt-1 text-sm text-ink-subtle">{{ filled() }}</p>
          }
        </div>

        <app-field
          [field]="address.street2"
          [label]="text.street2"
          [optional]="optional"
          [controlId]="id('street2')"
        >
          <input
            type="text"
            autocomplete="address-line2"
            appInput
            class="w-full"
            [formField]="address.street2"
          />
        </app-field>
      </div>

      <!-- Kept in the page while collapsed rather than dropped from it, and
           moved off-screen instead. Browser autofill fills a form field it can
           see in the DOM; a postcode and a city that are not there are simply
           not filled, and the customer who let the browser type the address
           got the street line alone. Off-screen they are filled like any
           other, and the read-back above prints what landed in them.

           Taken out of the tab order and hidden from assistive technology
           while they are off-screen. Saying that with inert, or with a
           display of none, would be tidier, and both are also how a browser
           decides a field is not worth filling. -->
      <div [class]="restClass()" [attr.aria-hidden]="collapsed() || null">
        <div class="grid gap-6 sm:grid-cols-[10rem_1fr]">
          <app-field
            [field]="address.postalCode"
            [label]="text.postalCode"
            [controlId]="id('postalCode')"
          >
            <!-- Two fields, one drawn at a time: the mask is a control of
                 its own, and an empty mask means "digits only, no limit",
                 which would quietly strip the letters out of a
                 code in a country whose codes carry them. So a deployment
                 that configured a digit mask gets a field that enforces it,
                 and everyone else gets a field that takes what is typed. -->
            @if (postalMask(); as mask) {
              <input
                type="text"
                inputmode="numeric"
                autocomplete="postal-code"
                [attr.tabindex]="collapsed() ? -1 : null"
                appInput
                appDigitMask
                [mask]="mask"
                class="w-full"
                [formField]="address.postalCode"
              />
            } @else {
              <input
                type="text"
                autocomplete="postal-code"
                [attr.tabindex]="collapsed() ? -1 : null"
                appInput
                class="w-full"
                [formField]="address.postalCode"
              />
            }
          </app-field>

          <app-field
            [field]="address.city"
            [label]="text.city"
            [controlId]="id('city')"
          >
            <input
              type="text"
              autocomplete="address-level2"
              [attr.tabindex]="collapsed() ? -1 : null"
              appInput
              class="w-full"
              [formField]="address.city"
            />
          </app-field>
        </div>

        <!-- Always asked for, though rarely typed by hand: a suggestion fills
           it, and what it fills is printed on the address. -->
        <app-field
          [field]="address.region"
          [label]="text.region"
          [optional]="optional"
          [controlId]="id('region')"
        >
          <input
            type="text"
            autocomplete="address-level1"
            [attr.tabindex]="collapsed() ? -1 : null"
            appInput
            class="w-full"
            [formField]="address.region"
          />
        </app-field>

        <!-- Nothing to ask where the deployment ships to one country: the single
           configured code is used, and the server still checks it. -->
        @if (countries.length > 1) {
          <app-field
            [field]="address.country"
            [label]="text.country"
            [controlId]="id('country')"
          >
            <app-select-input class="max-w-72">
              <select
                autocomplete="country"
                [attr.tabindex]="collapsed() ? -1 : null"
                appInput
                class="w-full"
                [formField]="address.country"
              >
                @for (option of countries; track option.code) {
                  <option [value]="option.code">{{ option.label }}</option>
                }
              </select>
            </app-select-input>
          </app-field>
        }
      </div>

      <!-- Always on screen, not revealed by a failure: there is then no state
           a customer can be stuck in, and nothing here has to detect one. -->
      @if (collapsed()) {
        <button type="button" appTextButton class="text-sm" (click)="expand()">
          {{ text.enterManually }}
        </button>
      }
    </div>
  `,
})
export class AddressFields {
  private readonly instance = nextId++;

  protected readonly text = inject(STOREFRONT_TEXT).address;
  protected readonly optional = inject(SHARED_TEXT).optional;
  protected readonly countries =
    inject(DEPLOYMENT_CONFIG).address?.countries ?? [];

  protected readonly suggestText = this.text.suggest;

  readonly form = input.required<AddressForm>();
  readonly showLabel = input(true);
  /** Ask for the street alone and let a suggestion fill the rest, only where
   * the deployment has a provider to suggest anything. */
  readonly compact = input(false);
  /** Opened from outside: the page found the address wanting and the fields
   * that are wrong are the ones this is folding away. */
  readonly reveal = input(false);

  /** A provider filled the address in. The page hears about it because a
   * delivery address that moves re-resolves its zone. */
  readonly picked = output<AddressComponents>();

  readonly attempted = computed(() => submitAttempt(this.form().field)());

  /** Once the fields are open they stay open: a form that folded itself back
   * up after being corrected would hide the correction. */
  private readonly expanded = signal(false);

  constructor() {
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
   * form is collapsed: still laid out, still fillable, just nowhere anyone
   * can see them. Left rather than up: a page does not scroll to what is
   * beyond its left edge. */
  protected readonly restClass = computed(() =>
    this.collapsed()
      ? 'absolute -left-[9999px] top-0 w-80 space-y-4'
      : 'space-y-4',
  );

  private readonly value = computed(() => this.form().field().value());

  /** The parts a suggestion filled, on one line: everything the street line
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

  /** The digit mask the chosen country's codes are entered through, where the
   * deployment configured one. */
  protected readonly postalMask = computed(
    () => this.form().postalCodeRule()?.mask ?? '',
  );

  protected expand(): void {
    this.expanded.set(true);
  }

  /**
   * Leaving the street field with nothing resolved behind it opens the rest.
   * A pick fills the postcode before the blur, since the list commits on
   * mousedown, so a suggestion that landed leaves this alone, and one that
   * never came leaves a customer who would otherwise have a postcode-shaped
   * hole in an address they cannot see.
   */
  protected settleStreet(): void {
    const { street, postalCode } = this.value();
    if (this.collapsed() && street.trim() && !postalCode.trim()) {
      this.expand();
    }
  }

  protected id(field: string): string {
    return `address-${this.instance}-${field}`;
  }

  protected suggested(components: AddressComponents): void {
    this.form().applySuggestion(components);
    this.picked.emit(components);
  }
}
