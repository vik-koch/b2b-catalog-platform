import { inject, Signal } from '@angular/core';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import { FormBuilder, Validators } from '@angular/forms';
import { AddressForm, createAddressForm } from '../addresses/address-form';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import {
  companyIdFormat,
  emailFormat,
  phoneValidators,
} from '../core/contact-fields';
import { FieldErrors } from '../core/form-errors';
import { CheckoutDraft, PartyChoice } from './checkout-draft.service';

/**
 * The four forms the checkout screen is made of, and the rules that decide
 * which of their fields have to be answered.
 *
 * They are grouped here because they are answered as one and validated as one:
 * the party's fields depend on who is asking, the address pickers are only
 * required while they are the ones being typed into, and all four are restored
 * together from the draft. The page keeps every decision about *when* to ask —
 * this is what is asked, and what counts as an answer.
 */
export function createCheckoutForms(deps: { guest: Signal<boolean> }) {
  const config = inject(DEPLOYMENT_CONFIG);
  const fb = inject(FormBuilder);

  /**
   * The party being invoiced, as its own two controls rather than as fields of
   * an address: whichever address the invoice goes to — a saved row or a typed
   * one — carries the same answer, so it cannot live on either form.
   */
  const party = fb.nonNullable.group({
    personName: [''],
    companyName: [''],
    companyId: ['', companyIdFormat(config.companyIdInput?.formats)],
  });

  /**
   * Who to talk to about the order — a guest's own, since there is no account
   * to read it off (FR-CART-03). `website` is ADR 0015's honeypot: a bot fills
   * it, a person never sees it, and this is the one form here a bot can reach.
   */
  const contact = fb.nonNullable.group({
    name: ['', Validators.required],
    // The contract's own rule, not Angular's: `Validators.email` accepts a
    // domain with no TLD, which the server then refuses.
    email: ['', [Validators.required, emailFormat()]],
    phone: ['', phoneValidators(config.phoneInput, true)],
    website: [''],
  });

  const delivery = createAddressForm();
  const billing = createAddressForm();

  return {
    party,
    contact,
    delivery,
    billing,

    partyErrors: new FieldErrors(party),
    contactErrors: new FieldErrors(contact),
    deliveryErrors: new FieldErrors(delivery.group),
    billingErrors: new FieldErrors(billing.group),

    /**
     * Which of the party's fields are required, given who is asking. A guest's
     * private party has no name field of its own — they are the contact, and
     * asking a person for their name twice is asking one of the two for
     * nothing.
     *
     * The unchosen branch is cleared as well as unrequired: a hidden branch
     * must be inert rather than merely invisible, or an abandoned answer is
     * submitted unseen.
     */
    applyPartyValidators(chosen: PartyChoice): void {
      const { personName, companyName, companyId } = party.controls;

      personName.setValue(chosen === 'person' ? personName.value : '');
      companyName.setValue(chosen === 'company' ? companyName.value : '');
      companyId.setValue(chosen === 'company' ? companyId.value : '');

      personName.setValidators(
        chosen === 'person' && !deps.guest() ? Validators.required : [],
      );
      companyName.setValidators(
        chosen === 'company' ? Validators.required : [],
      );
      companyId.setValidators(
        chosen === 'company'
          ? [
              Validators.required,
              companyIdFormat(config.companyIdInput?.formats),
            ]
          : [],
      );

      personName.updateValueAndValidity();
      companyName.updateValueAndValidity();
      companyId.updateValueAndValidity();
    },

    /** What the draft was holding when the page was last left. */
    restore(draft: CheckoutDraft): void {
      if (draft.newDeliveryAddress) delivery.fill(draft.newDeliveryAddress);
      if (draft.newBillingAddress) billing.fill(draft.newBillingAddress);
      if (draft.contact) {
        contact.patchValue(draft.contact, { emitEvent: false });
      }
      // Only the chosen party's own fields: the other branch is empty, which
      // is what it is on a form that has never been touched.
      party.setValue({
        personName:
          draft.party === 'person' ? (draft.otherPartyName ?? '') : '',
        companyName:
          draft.party === 'company' ? (draft.otherPartyName ?? '') : '',
        companyId: draft.party === 'company' ? (draft.otherPartyId ?? '') : '',
      });
    },

    /** A picked company fills both halves at once — the provider takes either
     * as its query, so whichever field was being typed in, the other follows. */
    pickParty(suggestion: PartySuggestion): void {
      party.patchValue({
        companyName: suggestion.name,
        ...(suggestion.registrationId
          ? { companyId: suggestion.registrationId }
          : {}),
      });
    },
  };
}

export type CheckoutForms = ReturnType<typeof createCheckoutForms>;
export type { AddressForm };
