import { inject, signal, Signal } from '@angular/core';
import { apply, form, hidden, required } from '@angular/forms/signals';
import {
  AddressDraft,
  AddressForm,
  injectAddressRules,
  blankAddress,
} from '../../../core/accounts/addresses/address-form';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { completeMask, emailAddress } from '../../../platform/field-rules';
import { companyIdFormat } from '../../../core/accounts/parties/company-id';
import { CheckoutDraft, PartyChoice } from './checkout-draft';

/** The party being invoiced where it is not the account's own. */
export interface PartyAnswers {
  personName: string;
  companyName: string;
  companyId: string;
}

/** A guest's way to be reached. */
export interface ContactAnswers {
  name: string;
  email: string;
  phone: string;
  /** A bot fills it; a person never sees it. */
  website: string;
}

export interface CheckoutAnswers {
  party: PartyAnswers;
  contact: ContactAnswers;
  delivery: AddressDraft;
  billing: AddressDraft;
}

/** The checkout's one form and what counts as an answer; the page decides when
 * to ask. What does not apply is hidden, kept for a change of mind, and never
 * sent. */
export function createCheckoutForms(deps: {
  guest: Signal<boolean>;
  party: () => PartyChoice;
  deliveryTyped: () => boolean;
  billingTyped: () => boolean;
}) {
  const config = inject(DEPLOYMENT_CONFIG);
  const fields = inject(SHARED_TEXT).fields;
  const text = inject(STOREFRONT_TEXT);
  const countries = config.address?.countries;
  const address = injectAddressRules();

  const model = signal<CheckoutAnswers>({
    party: { personName: '', companyName: '', companyId: '' },
    contact: { name: '', email: '', phone: '', website: '' },
    delivery: blankAddress(countries),
    billing: blankAddress(countries),
  });

  const field = form(
    model,
    (answers) => {
      const { party, contact } = answers;
      // A guest's private party is the contact: one name, asked once.
      hidden(party.personName, {
        when: () => deps.party() !== 'person' || deps.guest(),
      });
      required(party.personName, {
        message: text.checkout.party.nameRequired,
      });
      hidden(party.companyName, { when: () => deps.party() !== 'company' });
      required(party.companyName, { message: fields.companyName.required });
      hidden(party.companyId, { when: () => deps.party() !== 'company' });
      required(party.companyId, { message: fields.companyId.required });
      companyIdFormat(
        party.companyId,
        config.companyIdInput?.formats,
        fields.companyId.format,
      );

      // A customer's contact is their account's record, never asked.
      hidden(contact, { when: () => !deps.guest() });
      required(contact.name, { message: text.checkout.contact.nameRequired });
      required(contact.email, { message: fields.email.required });
      emailAddress(contact.email, fields.email.invalid);
      required(contact.phone, { message: fields.phone.required });
      completeMask(
        contact.phone,
        config.phoneInput?.mask,
        fields.phone.incomplete,
      );

      // An address is answered by its fields only while no saved row is.
      hidden(answers.delivery, { when: () => !deps.deliveryTyped() });
      apply(answers.delivery, address);
      hidden(answers.billing, { when: () => !deps.billingTyped() });
      apply(answers.billing, address);
    },
    { name: 'checkout' },
  );

  return {
    field,
    delivery: new AddressForm(field.delivery, countries),
    billing: new AddressForm(field.billing, countries),

    /** What the draft was holding when the page was last left. Before the
     * first render, so the fields are drawn with it. */
    restore(draft: CheckoutDraft): void {
      const { delivery, billing } = model();
      const other = draft.otherPartyName ?? '';
      model.set({
        // Only the chosen party's fields; the other branch stays empty.
        party: {
          personName: draft.party === 'person' ? other : '',
          companyName: draft.party === 'company' ? other : '',
          companyId:
            draft.party === 'company' ? (draft.otherPartyId ?? '') : '',
        },
        contact: { ...(draft.contact ?? model().contact), website: '' },
        delivery,
        billing,
      });
      if (draft.newDeliveryAddress) {
        this.delivery.fill(draft.newDeliveryAddress);
      }
      if (draft.newBillingAddress) this.billing.fill(draft.newBillingAddress);
    },
  };
}

export type CheckoutForms = ReturnType<typeof createCheckoutForms>;
