import { inject, Signal } from '@angular/core';
import {
  AccountProfile,
  AddressInput,
  OrderContact,
  OrderSubmission,
} from '@b2b-catalog-platform/shared';
import { AddressForm } from '../addresses/address-form';
import { CartService } from '../cart/cart.service';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { canonicalPhone } from '../core/contact-fields';
import { SubmitOrderResult } from '../orders/orders.service';
import { CheckoutDraft } from './checkout-draft.service';
import { CheckoutForms } from './checkout-forms';

export interface SubmissionDeps {
  forms: CheckoutForms;
  draft: Signal<CheckoutDraft>;
  guest: Signal<boolean>;
  isPickup: Signal<boolean>;
  billingEnabled: boolean;
  needsBillingPicker: Signal<boolean>;
  /** Which pickers are asking for a typed address rather than offering a row. */
  deliveryTyped: Signal<boolean>;
  billingTyped: Signal<boolean>;
  preferredDateInvalid: Signal<boolean>;
  profile: () => AccountProfile | undefined;
  /** The account's registered name, resolved the way the server resolves it. */
  accountName: Signal<string | null>;
  addressFor: (id: string | null, form: AddressForm) => AddressInput | null;
}

/**
 * Turning the answers into the order the contract wants, and turning the
 * server's refusal back into a sentence.
 *
 * Everything checked here is re-checked by the server: this only spares the
 * customer a round trip, so a rule that lives only here is a bug rather than a
 * shortcut.
 */
export function createCheckoutSubmission(deps: SubmissionDeps) {
  const cart = inject(CartService);
  const config = inject(DEPLOYMENT_CONFIG);
  const text = inject(APP_TEXT).checkout;

  /**
   * Who to talk to about this order: the guest's own answers, or the account's
   * record. A signed-in customer is never asked, so there is one place either
   * can come from and no chance of the two disagreeing.
   */
  const contact = (): OrderContact => {
    if (!deps.guest()) {
      const profile = deps.profile();
      return {
        name: deps.accountName() ?? profile?.email ?? '',
        email: profile?.email ?? '',
        phone: profile?.phone ?? '',
      };
    }
    const { name, email, phone } = deps.forms.contact.getRawValue();
    return {
      name: name.trim(),
      email: email.trim(),
      // Stored the way every other number is: the prefix the field showed plus
      // what was typed into it.
      phone: canonicalPhone(phone, config.phoneInput),
    };
  };

  return {
    /**
     * The order as the contract wants it, or null where the form is not
     * finished — which the fields themselves have just been told to say.
     * Consent is not part of it: that is the send screen's own gate, asked
     * after this has already been built once to get there.
     */
    build(): OrderSubmission | null {
      const { forms } = deps;
      const draft = deps.draft();

      if (deps.guest()) {
        if (forms.contact.invalid) return null;
        // A filled honeypot is a bot; the form goes no further and says
        // nothing about why (ADR 0015). The server refuses it again.
        if (forms.contact.controls.website.value.trim()) return null;
      } else if (!deps.profile()) {
        return null;
      }
      if (forms.party.invalid) return null;
      if (deps.deliveryTyped() && forms.delivery.group.invalid) return null;
      if (deps.billingTyped() && forms.billing.group.invalid) return null;
      if (deps.isPickup() && !draft.pickupLocationKey) return null;
      if (deps.preferredDateInvalid()) return null;

      const delivery = deps.isPickup()
        ? null
        : deps.addressFor(draft.deliveryAddressId, forms.delivery);
      // Unticked "the same address" is the only thing that makes the invoice
      // go somewhere else; ticked, it is literally the delivery one. Null where
      // the deployment invoices no address of its own — which is not "the
      // delivery address", or the order would have carried it.
      const billing = !deps.billingEnabled
        ? null
        : deps.needsBillingPicker()
          ? deps.addressFor(draft.billingAddressId, forms.billing)
          : delivery;
      if (deps.billingEnabled && !billing) return null;

      const { personName, companyName, companyId } = forms.party.getRawValue();
      const who = contact();
      // A guest ordering as a private person *is* the party, so the one name
      // they gave answers both. A company is its own party, with somebody at it
      // as the contact.
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
        // Null is "the party this account is registered as": its own record,
        // which the server reads rather than takes from a browser.
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
        acceptPrivacy: true,
      };
    },

    /** A refusal in the customer's words. The API answers with a code and
     * never with a sentence, so every one of them is named in the text
     * catalog. */
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
          // A 400 the contract does not name — a body the server rejected
          // before any rule ran. Nothing useful to say about it, but silence is
          // worse.
          return errors.generic;
      }
    },
  };
}
