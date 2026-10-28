import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { CompanyFields } from '../../shared/parties/company-fields';
import { Field } from '../../shared/ui/field';
import { FieldBinding } from '../../shared/ui/field-binding';
import { Input } from '../../shared/ui/input';
import { PhoneInput } from '../../shared/ui/phone-input';
import {
  Segmented,
  SegmentOption,
} from '@b2b-catalog-platform/ui/choices/segmented';
import { PartyChoice as Party } from './checkout-draft.service';
import { ContactAnswers, PartyAnswers } from './checkout-forms';

/**
 * Everything a guest is asked about themselves (FR-CART-03/09), in one block:
 * who the order is invoiced to, and how to reach whoever placed it.
 *
 * One block because for a guest they are one answer. A private person is the
 * party *and* the contact, so asking "who should we invoice" and "your name"
 * separately asked the same person for their name twice. A company is the
 * party and somebody at it is the contact, which is two answers — and exactly
 * the shape registration already uses, down to the switch at the top.
 *
 * A signed-in customer sees none of this: their account answers the contact,
 * and the party row offers it as the first of two choices.
 */
@Component({
  selector: 'app-guest-details',
  imports: [
    CompanyFields,
    Field,
    FieldBinding,
    FormField,
    Input,
    NgTemplateOutlet,
    PhoneInput,
    Segmented,
  ],
  host: { class: 'block' },
  template: `
    <fieldset class="space-y-4">
      <legend class="mb-2 font-medium">{{ text.heading }}</legend>

      <!-- Only where the shop sells to more than one kind of customer
           (FR-AUTH-13): with one, there is nothing to choose. -->
      @if (kinds.length > 1) {
        <app-segmented
          name="party-kind"
          [options]="kinds"
          [value]="party()"
          (valueChange)="partyChange.emit($event)"
        />
      }

      <!-- The company first, then who at it we ring: the order is invoiced to
           the one and confirmed with the other, and that is the order they are
           read in on the paperwork. -->
      @if (party() === 'company') {
        <app-company-fields
          idInputId="party-companyId"
          nameInputId="party-companyName"
          [idField]="partyField().companyId"
          [nameField]="partyField().companyName"
          [text]="companyText"
          (picked)="picked.emit($event)"
        />
        <ng-container [ngTemplateOutlet]="reach" />
      } @else {
        <ng-container [ngTemplateOutlet]="reach" />
      }

      <ng-template #reach>
        <app-field
          [field]="contact().name"
          [label]="party() === 'company' ? text.contactName : text.name"
          controlId="contact-name"
        >
          <input
            type="text"
            autocomplete="name"
            appInput
            class="w-full"
            [formField]="contact().name"
          />
        </app-field>

        <app-field
          [field]="contact().email"
          [label]="fields.email.label"
          controlId="contact-email"
        >
          <input
            type="email"
            autocomplete="email"
            appInput
            class="w-full"
            [formField]="contact().email"
          />
        </app-field>

        <app-field
          [field]="contact().phone"
          [label]="fields.phone.label"
          controlId="contact-phone"
        >
          <app-phone-input [field]="contact().phone" [phone]="phoneInput" />
        </app-field>

        <p class="text-sm text-ink-subtle">{{ text.note }}</p>
      </ng-template>
    </fieldset>
  `,
})
export class GuestDetails {
  protected readonly authText = inject(STOREFRONT_TEXT).auth;
  protected readonly fields = inject(SHARED_TEXT).fields;
  protected readonly text = inject(STOREFRONT_TEXT).checkout.contact;
  private readonly partyChoice = inject(STOREFRONT_TEXT).partyChoice;
  protected readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;
  /** Typed as the whole choice, not just these two: the pill hands back
   * what the page holds, and the page also knows about the account. */
  protected readonly kinds: readonly SegmentOption<Party>[] = inject(
    DEPLOYMENT_CONFIG,
  ).customerTypes.map((value) => ({
    value,
    label: this.partyChoice[value],
  }));

  protected readonly companyText = {
    idLabel: this.fields.companyId.label,
    nameLabel: this.fields.companyName.label,
  };

  readonly party = input.required<Party>();
  /** The page's form decides what each answer must be. */
  readonly partyField = input.required<FieldTree<PartyAnswers>>();
  readonly contact = input.required<FieldTree<ContactAnswers>>();

  readonly partyChange = output<Party>();
  readonly picked = output<PartySuggestion>();
}
