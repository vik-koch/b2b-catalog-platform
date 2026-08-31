import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { FieldErrors } from '../core/form-errors';
import { CompanyFields } from '../parties/company-fields';
import { EmailField } from '../ui/email-field';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';
import { PhoneField } from '../ui/phone-field';
import { Segmented, SegmentOption } from '../ui/segmented';
import { PartyChoice as Party } from './checkout-draft.service';

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
    EmailField,
    FieldLabel,
    Input,
    NgTemplateOutlet,
    PhoneField,
    ReactiveFormsModule,
    Segmented,
  ],
  host: { class: 'block' },
  template: `
    <fieldset class="space-y-4">
      <legend class="mb-2 font-medium">{{ text.heading }}</legend>

      <app-segmented
        name="party-kind"
        [options]="kinds"
        [value]="party()"
        (chosen)="partyChange.emit($event)"
      />

      <!-- The company first, then who at it we ring: the order is invoiced to
           the one and confirmed with the other, and that is the order they are
           read in on the paperwork. -->
      @if (party() === 'company') {
        <app-company-fields
          idInputId="party-companyId"
          nameInputId="party-companyName"
          [idControl]="companyIdControl()"
          [nameControl]="companyNameControl()"
          [text]="companyText"
          [required]="true"
          [idInvalid]="companyIdInvalid()"
          [nameInvalid]="companyNameInvalid()"
          (picked)="picked.emit($event)"
        />
        <ng-container [ngTemplateOutlet]="reach" />
      } @else {
        <ng-container [ngTemplateOutlet]="reach" />
      }

      <ng-template #reach>
        <div>
          <label for="contact-name" appFieldLabel>
            {{ party() === 'company' ? text.contactName : text.name }}
            <span class="text-accent" aria-hidden="true">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            autocomplete="name"
            aria-required="true"
            appInput
            class="w-full"
            [formControl]="nameControl()"
            [attr.aria-invalid]="errors().show(nameControl()) || null"
          />
          @if (errors().show(nameControl())) {
            <p class="mt-1 text-sm text-red-600">{{ text.nameRequired }}</p>
          }
        </div>

        <app-email-field
          inputId="contact-email"
          [control]="emailControl()"
          [label]="authText.email"
          [text]="emailText"
          [required]="true"
          [invalid]="errors().show(emailControl())"
        />

        <app-phone-field
          inputId="contact-phone"
          [control]="phoneControl()"
          [label]="authText.register.phone"
          [text]="phoneText"
          [required]="true"
          [invalid]="errors().show(phoneControl())"
        />

        <p class="text-sm text-muted">{{ text.note }}</p>
      </ng-template>
    </fieldset>
  `,
})
export class GuestDetails {
  protected readonly authText = inject(APP_TEXT).auth;
  protected readonly text = inject(APP_TEXT).checkout.contact;
  protected readonly partyText = inject(APP_TEXT).checkout.party;
  /** Typed as the whole choice, not just these two: the pill hands back
   * what the page holds, and the page also knows about the account. */
  protected readonly kinds: readonly SegmentOption<Party>[] = [
    { value: 'person', label: this.partyText.person },
    { value: 'company', label: this.partyText.company },
  ];

  /** The same messages the sign-up form shows for the same fields. */
  protected readonly emailText = {
    required: this.authText.validation.emailRequired,
    invalid: this.authText.validation.emailInvalid,
  };
  protected readonly phoneText = {
    required: this.authText.register.validation.phoneRequired,
    incomplete: this.authText.register.validation.phoneIncomplete,
  };
  protected readonly companyText = {
    ...this.authText.register.companySuggest,
    idLabel: this.authText.register.companyId,
    nameLabel: this.authText.register.companyName,
    idFormat: this.authText.register.validation.companyIdFormat,
    idRequired: this.authText.register.validation.companyIdRequired,
    nameRequired: this.authText.register.validation.companyNameRequired,
  };

  readonly party = input.required<Party>();
  readonly nameControl = input.required<FormControl<string>>();
  readonly emailControl = input.required<FormControl<string>>();
  readonly phoneControl = input.required<FormControl<string>>();
  readonly companyNameControl = input.required<FormControl<string>>();
  readonly companyIdControl = input.required<FormControl<string>>();
  readonly companyNameInvalid = input(false);
  readonly companyIdInvalid = input(false);
  /** Whose rules decide when a message is due — the page's, since only it
   * knows whether the form has been sent for checking yet. */
  readonly errors = input.required<FieldErrors>();

  readonly partyChange = output<Party>();
  readonly picked = output<PartySuggestion>();
}
