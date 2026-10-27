import { inject, signal, Signal } from '@angular/core';
import { apply, form, hidden, required } from '@angular/forms/signals';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import {
  AddressDraft,
  AddressForm,
  addressRules,
  blankAddress,
} from '../../shared/addresses/address-form';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import {
  companyIdFormat,
  completeMask,
  emailAddress,
} from '../../shared/core/field-rules';
import { CheckoutDraft, PartyChoice } from './checkout-draft.service';

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
  /** ADR 0015's honeypot: a bot fills it, a person never sees it. */
  website: string;
}

export interface CheckoutAnswers {
  party: PartyAnswers;
  contact: ContactAnswers;
  delivery: AddressDraft;
  billing: AddressDraft;
}

/**
 * The one form the checkout screen is made of, and the rules that decide
 * which of its answers have to be given.
 *
 * One form because it is answered as one and checked as one: the party's
 * fields depend on who is asking and what they chose, the contact is a guest's
 * only, and each address is asked only while it is the one being typed rather
 * than picked from the book. What does not apply is hidden: it counts for
 * nothing, and whatever was typed into it stays for a change of mind but is
 * never sent (the submission reads the chosen branch only). The page keeps
 * every decision about *when* to ask; this is what is asked, and what counts as
 * an answer.
 */
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
      // A guest's private party has no name field of its own: they are the
      // contact, and asking a person for their name twice is asking one of
      // the two for nothing.
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
      const address = addressRules(text.address, countries);
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
        // Only the chosen party's own fields: the other branch is empty, which
        // is what it is on a form that has never been touched.
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

    /** A picked company fills both halves at once: the provider takes either
     * as its query, so whichever field was being typed in, the other follows. */
    pickParty(suggestion: PartySuggestion): void {
      field.party.companyName().value.set(suggestion.name);
      if (suggestion.registrationId) {
        field.party.companyId().value.set(suggestion.registrationId);
      }
    },
  };
}

export type CheckoutForms = ReturnType<typeof createCheckoutForms>;
