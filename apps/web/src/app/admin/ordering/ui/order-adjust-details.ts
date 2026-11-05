import { ACCOUNTS_CONFIG } from '../../../core/accounts/accounts-config';
import { Component, computed, inject, input, output } from '@angular/core';
import { type FieldTree } from '@angular/forms/signals';
import { PaymentMethod } from '@b2b-catalog-platform/shared/core/ordering';
import { AddressFields } from '../../../core/accounts/addresses/address-fields';
import { AddressForm } from '../../../core/accounts/addresses/address-form';
import { CompanyFields } from '../../../core/accounts/parties/company-fields';
import { ADMIN_TEXT } from '../../../platform/config/admin-text';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { staffFields } from '../../platform/staff-fields';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { PhoneInput } from '@b2b-catalog-platform/ui/inputs/phone-input';
import {
  SegmentOption,
  Segmented,
} from '@b2b-catalog-platform/ui/choices/segmented';
import { SelectInput } from '@b2b-catalog-platform/ui/inputs/select-input';
import {
  AdjustAnswers,
  PartyKind,
  paymentOptions,
} from '../order-adjust-draft';

/**
 * Who an adjusted order goes to and how it is paid (FR-ORD-03): fulfilment and
 * collection point, the invoiced party, the invoice address, payment and the
 * contact. The page holds the form and the answers; this draws them.
 */
@Component({
  selector: 'app-order-adjust-details',
  imports: [
    AddressFields,
    CompanyFields,
    ErrorText,
    FieldLabel,
    FORM_FIELDS,
    Input,
    PhoneInput,
    Segmented,
    SelectInput,
  ],
  host: { class: 'block space-y-8' },
  template: `
    @if (refusal(); as message) {
      <p uiErrorText role="alert">
        {{ message }}
      </p>
    }

    <section>
      <h2 class="mb-2 font-medium">
        {{ sharedText.fulfilment.label }}
      </h2>
      <!-- Method and collection point share a line: one
           question. -->
      <div class="grid gap-6 sm:grid-cols-2">
        <div>
          <label uiFieldLabel for="adjust-fulfilment" class="sr-only">
            {{ sharedText.fulfilment.label }}
          </label>
          <ui-select-input>
            <select
              uiInput
              id="adjust-fulfilment"
              class="w-full"
              [disabled]="disabled()"
              (change)="fulfilmentChange.emit($any($event.target).value)"
            >
              <option
                value="delivery"
                [selected]="fulfilmentMethod() === 'delivery'"
              >
                {{ sharedText.fulfilment.delivery }}
              </option>
              @if (locations.length) {
                <option
                  value="pickup"
                  [selected]="fulfilmentMethod() === 'pickup'"
                >
                  {{ sharedText.fulfilment.pickup }}
                </option>
              }
            </select>
          </ui-select-input>
        </div>
        @if (fulfilmentMethod() === 'pickup') {
          <div>
            <label uiFieldLabel for="adjust-pickup" class="sr-only">
              {{ ordersText.pickupPoint }}
            </label>
            <ui-select-input>
              <select
                uiInput
                id="adjust-pickup"
                class="w-full"
                [disabled]="disabled()"
                (change)="pickupKeyChange.emit($any($event.target).value)"
              >
                @for (location of locations; track location.key) {
                  <option
                    [value]="location.key"
                    [selected]="pickupKey() === location.key"
                  >
                    {{ location.name }}
                  </option>
                }
              </select>
            </ui-select-input>
          </div>
        }
      </div>

      @if (fulfilmentMethod() === 'delivery') {
        <div class="mt-4">
          <h3 class="mb-2 text-sm font-medium">
            {{ names.deliveryAddress }}
          </h3>
          <app-address-fields [form]="delivery()" [showLabel]="false" />
        </div>
      }
    </section>

    <section>
      <h2 class="mb-2 font-medium">{{ names.invoicedTo }}</h2>
      <!-- Registration's and checkout's switch, held to the
           same rules. -->
      @if (partyKinds.length > 1) {
        <ui-segmented
          name="adjust-party-kind"
          class="mb-4"
          [options]="partyKinds"
          [value]="partyKind()"
          (valueChange)="partyKindChange.emit($event)"
        />
      }

      @if (partyKind() === 'person') {
        <ui-field
          [field]="form().party.personName"
          [label]="fields.name.label"
          controlId="adjust-party-person"
        >
          <input
            uiInput
            class="w-full"
            autocomplete="off"
            [formField]="form().party.personName"
          />
        </ui-field>
      } @else {
        <app-company-fields
          idInputId="adjust-party-id"
          nameInputId="adjust-party-name"
          [idField]="form().party.companyId"
          [nameField]="form().party.companyName"
        />
      }
    </section>

    @if (billingEnabled) {
      <section>
        <h2 class="mb-2 font-medium">
          {{ text.billingAddress }}
        </h2>
        <app-address-fields [form]="billing()" [showLabel]="false" />
      </section>
    }

    <section>
      <h2 class="mb-2 font-medium">{{ names.payment }}</h2>
      <label uiFieldLabel for="adjust-payment" class="sr-only">
        {{ names.payment }}
      </label>
      <ui-select-input>
        <select
          uiInput
          id="adjust-payment"
          class="w-full"
          [disabled]="disabled()"
          (change)="paymentChange.emit($any($event.target).value)"
        >
          <!-- A company is invoiced: cash and card are not
               offered, as the server refuses them. -->
          @for (option of paymentOptions(); track option.value) {
            <option
              [value]="option.value"
              [selected]="paymentMethod() === option.value"
            >
              {{ option.label }}
            </option>
          }
        </select>
      </ui-select-input>
    </section>

    <section>
      <h2 class="mb-2 font-medium">{{ names.contact }}</h2>
      <div class="grid gap-6 sm:grid-cols-[20rem_1fr]">
        <ui-field
          [field]="form().contact.name"
          [label]="fields.name.label"
          controlId="adjust-contact-name"
        >
          <input
            uiInput
            class="w-full"
            autocomplete="off"
            [formField]="form().contact.name"
          />
        </ui-field>
        <!-- The number field is only as wide as its mask. -->
        <ui-field
          [field]="form().contact.phone"
          [label]="fields.phone.label"
          controlId="adjust-contact-phone"
        >
          <ui-phone-input
            [field]="form().contact.phone"
            [phone]="phoneInput"
            autocomplete="off"
          />
        </ui-field>
        <ui-field
          class="sm:col-span-2"
          [field]="form().contact.email"
          [label]="fields.email.label"
          controlId="adjust-contact-email"
        >
          <input
            type="email"
            uiInput
            class="w-full"
            autocomplete="off"
            [formField]="form().contact.email"
          />
        </ui-field>
      </div>
    </section>
  `,
})
export class OrderAdjustDetails {
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly accountsConfig = inject(ACCOUNTS_CONFIG);
  private readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = this.adminText.orders.adjust;
  protected readonly ordersText = this.adminText.orders;
  protected readonly sharedText = inject(SHARED_TEXT);
  protected readonly names = this.sharedText.order;
  protected readonly fields = staffFields(
    this.sharedText.fields,
    this.adminText.fields,
  );
  protected readonly phoneInput = this.config.phoneInput;
  protected readonly locations = this.config.pickup?.locations ?? [];
  protected readonly billingEnabled = this.config.billingAddressEnabled;

  readonly form = input.required<FieldTree<AdjustAnswers>>();
  readonly delivery = input.required<AddressForm>();
  readonly billing = input.required<AddressForm>();
  readonly fulfilmentMethod = input.required<'delivery' | 'pickup'>();
  readonly pickupKey = input.required<string | null>();
  readonly partyKind = input.required<PartyKind>();
  readonly paymentMethod = input.required<PaymentMethod>();
  /** A refusal about these fields, said above them. */
  readonly refusal = input<string | null>(null);
  readonly disabled = input(false);

  readonly fulfilmentChange = output<'delivery' | 'pickup'>();
  readonly pickupKeyChange = output<string>();
  readonly partyKindChange = output<PartyKind>();
  readonly paymentChange = output<PaymentMethod>();

  /** In the deployment's order (FR-AUTH-13). */
  protected readonly partyKinds: SegmentOption<PartyKind>[] =
    this.accountsConfig.customerTypes.map((value) => ({
      value,
      label:
        value === 'person'
          ? this.text.partyKindPerson
          : this.text.partyKindCompany,
    }));

  protected readonly paymentOptions = computed(() =>
    paymentOptions(this.partyKind(), this.ordersText.paymentMethods),
  );
}
