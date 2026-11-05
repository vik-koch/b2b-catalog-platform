import { ACCOUNTS_CONFIG } from '../../../../core/accounts/accounts-config';
import { STOREFRONT_ACCOUNTS_TEXT } from '../../../accounts/accounts-text';
import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { STOREFRONT_TEXT } from '../../../../platform/config/storefront-text';
import { SHARED_TEXT } from '../../../../platform/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../../../platform/config/deployment-config';
import { CompanyFields } from '../../../../core/accounts/parties/company-fields';
import { Field } from '@b2b-catalog-platform/ui/fields/field';
import { FieldBinding } from '@b2b-catalog-platform/ui/fields/field-binding';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { PhoneInput } from '@b2b-catalog-platform/ui/inputs/phone-input';
import {
  Segmented,
  SegmentOption,
} from '@b2b-catalog-platform/ui/choices/segmented';
import { PartyChoice as Party } from '../checkout-draft';
import { ContactAnswers, PartyAnswers } from '../checkout-forms';

/** What a guest is asked about themselves (FR-CART-03/09), in one block: a
 * private person is party and contact at once; a company is the party with the
 * guest as its contact, as registration asks it. */
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
        <ui-segmented
          name="party-kind"
          [options]="kinds"
          [value]="party()"
          (valueChange)="partyChange.emit($event)"
        />
      }

      <!-- The company, then who at it: the paperwork's order. -->
      @if (party() === 'company') {
        <app-company-fields
          idInputId="party-companyId"
          nameInputId="party-companyName"
          [idField]="partyField().companyId"
          [nameField]="partyField().companyName"
        />
        <ng-container [ngTemplateOutlet]="reach" />
      } @else {
        <ng-container [ngTemplateOutlet]="reach" />
      }

      <ng-template #reach>
        <ui-field
          [field]="contact().name"
          [label]="party() === 'company' ? text.contactName : text.name"
          controlId="contact-name"
        >
          <input
            type="text"
            autocomplete="name"
            uiInput
            class="w-full"
            [formField]="contact().name"
          />
        </ui-field>

        <ui-field
          [field]="contact().email"
          [label]="fields.email.label"
          controlId="contact-email"
        >
          <input
            type="email"
            autocomplete="email"
            uiInput
            class="w-full"
            [formField]="contact().email"
          />
        </ui-field>

        <ui-field
          [field]="contact().phone"
          [label]="fields.phone.label"
          controlId="contact-phone"
        >
          <ui-phone-input [field]="contact().phone" [phone]="phoneInput" />
        </ui-field>

        <p class="text-sm text-ink-subtle">{{ text.note }}</p>
      </ng-template>
    </fieldset>
  `,
})
export class GuestDetails {
  protected readonly authText = inject(STOREFRONT_ACCOUNTS_TEXT).auth;
  protected readonly fields = inject(SHARED_TEXT).fields;
  protected readonly text = inject(STOREFRONT_TEXT).checkout.contact;
  private readonly partyChoice = inject(STOREFRONT_ACCOUNTS_TEXT).partyChoice;
  protected readonly phoneInput = inject(DEPLOYMENT_CONFIG).phoneInput;
  /** The whole choice type: the page holds it, account included. */
  protected readonly kinds: readonly SegmentOption<Party>[] = inject(
    ACCOUNTS_CONFIG,
  ).customerTypes.map((value) => ({
    value,
    label: this.partyChoice[value],
  }));

  readonly party = input.required<Party>();
  readonly partyField = input.required<FieldTree<PartyAnswers>>();
  readonly contact = input.required<FieldTree<ContactAnswers>>();

  readonly partyChange = output<Party>();
}
