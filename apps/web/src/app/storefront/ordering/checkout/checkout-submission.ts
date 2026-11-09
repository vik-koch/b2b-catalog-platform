import { inject, Signal } from '@angular/core';

import { AddressInput } from '@b2b-catalog-platform/shared/core/accounts';
import {
  OrderContact,
  OrderSubmission,
} from '@b2b-catalog-platform/shared/core/ordering';
import { AccountProfile } from '@b2b-catalog-platform/shared/storefront/accounts';

import { AddressForm } from '../../../core/accounts/addresses/address-form';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { canonicalPhone } from '../../../platform/contact-fields';
import { CartService } from '../cart/cart.service';
import { STOREFRONT_ORDERING_TEXT } from '../ordering-text';
import { SubmitOrderResult } from '../orders/orders.service';
import { CheckoutDraft } from './checkout-draft';
import { CheckoutForms } from './checkout-forms';

export interface SubmissionDeps {
  forms: CheckoutForms;
  draft: Signal<CheckoutDraft>;
  guest: Signal<boolean>;
  isPickup: Signal<boolean>;
  billingEnabled: boolean;
  needsBillingPicker: Signal<boolean>;
  /** The pickers holding a typed address. */
  deliveryTyped: Signal<boolean>;
  billingTyped: Signal<boolean>;
  preferredDateInvalid: Signal<boolean>;
  profile: () => AccountProfile | undefined;
  /** The account's registered name, resolved the way the server resolves it. */
  accountName: Signal<string | null>;
  addressFor: (id: string | null, form: AddressForm) => AddressInput | null;
}

/** The answers as the contract's order, and the server's refusals as sentences.
 * The server re-checks everything: a rule only here is a bug. */
export function createCheckoutSubmission(deps: SubmissionDeps) {
  const cart = inject(CartService);
  const config = inject(DEPLOYMENT_CONFIG);
  const text = inject(STOREFRONT_ORDERING_TEXT).checkout;

  /** The guest's answers, or the account's record: a customer is never asked.
   * */
  const contact = (): OrderContact => {
    if (!deps.guest()) {
      const profile = deps.profile();
      return {
        name: deps.accountName() ?? profile?.email ?? '',
        email: profile?.email ?? '',
        phone: profile?.phone ?? '',
      };
    }
    const { name, email, phone } = deps.forms.field.contact().value();
    return {
      name: name.trim(),
      email: email.trim(),
      // Stored like every number: the field's prefix plus what was typed.
      phone: canonicalPhone(phone, config.phoneInput),
    };
  };

  return {
    /** Null where the form is unfinished. Consent is not part of it: the send
     * screen asks that after. */
    build(): OrderSubmission | null {
      const { forms } = deps;
      const draft = deps.draft();

      if (!forms.field().valid()) return null;
      if (deps.guest()) {
        // A filled honeypot is a bot: silently no further. The server refuses
        // it again.
        if (forms.field.contact.website().value().trim()) return null;
      } else if (!deps.profile()) {
        return null;
      }
      if (deps.isPickup() && !draft.pickupLocationKey) return null;
      if (deps.preferredDateInvalid()) return null;

      const delivery = deps.isPickup()
        ? null
        : deps.addressFor(draft.deliveryAddressId, forms.delivery);
      // Ticked, the invoice goes to the delivery address. Null where the
      // deployment invoices no address.
      const billing = !deps.billingEnabled
        ? null
        : deps.needsBillingPicker()
          ? deps.addressFor(draft.billingAddressId, forms.billing)
          : delivery;
      if (deps.billingEnabled && !billing) return null;

      const { personName, companyName, companyId } = forms.field
        .party()
        .value();
      const who = contact();
      // A private guest is the party; a company has the guest as its contact.
      const partyName =
        draft.party === 'company'
          ? companyName
          : deps.guest()
            ? who.name
            : personName;

      return {
        lines: cart.request(),
        contact: who,
        fulfilmentMethod: draft.fulfilmentMethod,
        // Null is the account's own party, which the server reads from its
        // record.
        party:
          draft.party === 'account' && !deps.guest()
            ? null
            : {
                name: partyName.trim(),
                registrationId:
                  draft.party === 'company' ? companyId.trim() : null,
              },
        deliveryAddress: delivery,
        pickupLocationKey: deps.isPickup() ? draft.pickupLocationKey : null,
        billingAddress: billing,
        paymentMethod: draft.paymentMethod,
        preferredDate: draft.preferredDate,
        customerNote: draft.customerNote,
        expectedTotalMinor: cart.totalMinor(),
      };
    },

    /** A refusal code in the customer's words. */
    refusal(code: Exclude<SubmitOrderResult, { ok: true }>['code']): string {
      const errors = text.errors;
      switch (code) {
        case 'invalid-company-id':
          return errors.invalidCompanyId;
        case 'unsupported-country':
          return errors.unsupportedCountry;
        case 'invalid-postal-code':
          return errors.invalidPostalCode;
        case 'unknown-pickup-location':
          return errors.unknownPickupLocation;
        case 'billing-details-required':
          return errors.billingDetailsRequired;
        case 'cash-not-available':
          return errors.cashNotAvailable;
        case 'customer-type-not-accepted':
          return errors.customerTypeNotAccepted;
        case 'billing-address-required':
          return errors.incomplete;
        case 'party-required':
          return errors.partyRequired;
        case 'cart-changed':
          return errors.cartChanged;
        case 'rejected':
          return errors.rejected;
        case 'staff-cannot-order':
          return errors.staffAccount;
        case 'pairing-unsatisfied':
          return errors.pairingUnsatisfied;
        default:
          // A 400 the contract does not name: rejected before any rule ran.
          return errors.generic;
      }
    },
  };
}
