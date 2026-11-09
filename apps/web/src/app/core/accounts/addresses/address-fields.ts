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

import { AddressComponents } from '@b2b-catalog-platform/shared/core/accounts';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { Field } from '@b2b-catalog-platform/ui/fields/field';
import { FIELD_ATTEMPT } from '@b2b-catalog-platform/ui/fields/field-attempt';
import { FieldBinding } from '@b2b-catalog-platform/ui/fields/field-binding';
import { submitAttempt } from '@b2b-catalog-platform/ui/fields/submit-attempt';
import { DigitMask } from '@b2b-catalog-platform/ui/inputs/digit-mask';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { SelectInput } from '@b2b-catalog-platform/ui/inputs/select-input';

import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { ACCOUNTS_CONFIG } from '../accounts-config';
import { SHARED_ACCOUNTS_TEXT } from '../accounts-text';
import { AddressForm } from './address-form';
import { AddressSuggestInput } from './address-suggest-input';

/** Checkout draws two of these on one page, so ids are per instance. */
let nextId = 0;

/**
 * The fields of an address it is handed; validity and submission are the
 * page's. `compact` asks for the street alone where a provider can fill the
 * rest, reads the filled parts back as text, and keeps the full fields one
 * click away for when the provider is down or silent.
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
  // Its own attempt, keyed by the address, so a page can mark it alone while
  // it is part of a larger form.
  providers: [
    { provide: FIELD_ATTEMPT, useExisting: forwardRef(() => AddressFields) },
  ],
  template: `
    @let address = form().field;
    <!-- A container: the suggestion panel may grow past the street field,
         never past the form. -->
    <div class="@container space-y-4">
      @if (showLabel()) {
        <ui-field
          [field]="address.label"
          [label]="text.label"
          [hint]="text.labelHint"
          [optional]="optional"
          [controlId]="id('label')"
        >
          <input
            type="text"
            uiInput
            class="w-full"
            [formField]="address.label"
          />
        </ui-field>
      }

      <div [class]="streetRow()">
        <div (focusout)="settleStreet()">
          <ui-field
            [field]="address.street"
            [label]="collapsed() ? text.addressLine : text.street"
            [controlId]="id('street')"
          >
            <app-address-suggest-input
              [field]="address.street"
              [country]="address.country().value()"
              (picked)="suggested($event)"
            />
          </ui-field>
          @if (collapsed() && filled()) {
            <p class="mt-1 text-sm text-ink-subtle">{{ filled() }}</p>
          }
        </div>

        <ui-field
          [field]="address.street2"
          [label]="text.street2"
          [optional]="optional"
          [controlId]="id('street2')"
        >
          <input
            type="text"
            autocomplete="address-line2"
            uiInput
            class="w-full"
            [formField]="address.street2"
          />
        </ui-field>
      </div>

      <!-- Collapsed, moved off-screen rather than removed: browser autofill
           only fills fields in the DOM, and skips inert or display:none ones.
           So they leave the tab order and the accessibility tree by hand. -->
      <div [class]="restClass()" [attr.aria-hidden]="collapsed() || null">
        <div class="grid gap-6 sm:grid-cols-[10rem_1fr]">
          <ui-field
            [field]="address.postalCode"
            [label]="text.postalCode"
            [controlId]="id('postalCode')"
          >
            <!-- Two inputs: an empty mask means "digits only", which would
                 strip the letters from codes that carry them. -->
            @if (postalMask(); as mask) {
              <input
                type="text"
                inputmode="numeric"
                autocomplete="postal-code"
                [attr.tabindex]="collapsed() ? -1 : null"
                uiInput
                uiDigitMask
                [mask]="mask"
                class="w-full"
                [formField]="address.postalCode"
              />
            } @else {
              <input
                type="text"
                autocomplete="postal-code"
                [attr.tabindex]="collapsed() ? -1 : null"
                uiInput
                class="w-full"
                [formField]="address.postalCode"
              />
            }
          </ui-field>

          <ui-field
            [field]="address.city"
            [label]="text.city"
            [controlId]="id('city')"
          >
            <input
              type="text"
              autocomplete="address-level2"
              [attr.tabindex]="collapsed() ? -1 : null"
              uiInput
              class="w-full"
              [formField]="address.city"
            />
          </ui-field>
        </div>

        <ui-field
          [field]="address.region"
          [label]="text.region"
          [optional]="optional"
          [controlId]="id('region')"
        >
          <input
            type="text"
            autocomplete="address-level1"
            [attr.tabindex]="collapsed() ? -1 : null"
            uiInput
            class="w-full"
            [formField]="address.region"
          />
        </ui-field>

        <!-- One configured country is used without asking; the server still
             checks it. -->
        @if (countries.length > 1) {
          <ui-field
            [field]="address.country"
            [label]="text.country"
            [controlId]="id('country')"
          >
            <ui-select-input class="max-w-72">
              <select
                autocomplete="country"
                [attr.tabindex]="collapsed() ? -1 : null"
                uiInput
                class="w-full"
                [formField]="address.country"
              >
                @for (option of countries; track option.code) {
                  <option [value]="option.code">{{ option.label }}</option>
                }
              </select>
            </ui-select-input>
          </ui-field>
        }
      </div>

      <!-- Always shown, not only after a failure, so no state traps anyone. -->
      @if (collapsed()) {
        <button type="button" uiTextButton class="text-sm" (click)="expand()">
          {{ text.enterManually }}
        </button>
      }
    </div>
  `,
})
export class AddressFields {
  private readonly instance = nextId++;

  protected readonly text = inject(SHARED_ACCOUNTS_TEXT).address;
  protected readonly optional = inject(SHARED_TEXT).optional;
  protected readonly countries =
    inject(ACCOUNTS_CONFIG).address?.countries ?? [];

  readonly form = input.required<AddressForm>();
  /** Off where there is no address book to file it under (checkout). */
  readonly showLabel = input(true);
  /** Only where the deployment has a suggestion provider. */
  readonly compact = input(false);
  /** Opens the fields from outside, when the page found them wanting. */
  readonly reveal = input(false);

  /** A delivery address that moves re-resolves its zone. */
  readonly picked = output<AddressComponents>();

  readonly attempted = computed(() => submitAttempt(this.form().field)());

  /** Never folds back: that would hide a correction. */
  private readonly expanded = signal(false);

  constructor() {
    effect(() => {
      if (this.reveal()) this.expand();
    });
  }

  protected readonly collapsed = computed(
    () => this.compact() && !this.expanded(),
  );

  /** Side by side while collapsed, in the postcode's column widths, so the
   * two states line up. */
  protected readonly streetRow = computed(() =>
    this.collapsed() ? 'grid gap-6 sm:grid-cols-2' : 'grid gap-6',
  );

  /** Left, not up: a page does not scroll to what is past its left edge. */
  protected readonly restClass = computed(() =>
    this.collapsed()
      ? 'absolute -left-[9999px] top-0 w-80 space-y-4'
      : 'space-y-4',
  );

  private readonly value = computed(() => this.form().field().value());

  /** What a suggestion filled, minus the street the field above shows. */
  protected readonly filled = computed(() => {
    const value = this.value();
    return [
      [value.postalCode, value.city].filter(Boolean).join(' '),
      value.region,
    ]
      .filter(Boolean)
      .join(', ');
  });

  protected readonly postalMask = computed(
    () => this.form().postalCodeRule()?.mask ?? '',
  );

  protected expand(): void {
    this.expanded.set(true);
  }

  /**
   * Leaving a typed street with no postcode behind it opens the rest. A pick
   * commits on mousedown, before this blur, so a landed suggestion is left
   * alone.
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
