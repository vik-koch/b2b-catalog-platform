import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { FieldErrors } from '../../shared/core/form-errors';
import { ReactiveCompanyFields } from '../../shared/parties/reactive-company-fields';
import { EmailField } from '../../shared/ui/email-field';
import { FieldLabel } from '../../shared/ui/field-label';
import { Input } from '../../shared/ui/input';
import { PhoneField } from '../../shared/ui/phone-field';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { PartyChoice as Party } from './checkout-draft.service';
import { ErrorText } from '../../shared/ui/error-text';

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
    ReactiveCompanyFields,
    EmailField,
    FieldLabel,
    Input,
    NgTemplateOutlet,
    PhoneField,
    ReactiveFormsModule,
    Segmented,
    ErrorText,
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
          (chosen)="partyChange.emit($event)"
        />
      }

      <!-- The company first, then who at it we ring: the order is invoiced to
           the one and confirmed with the other, and that is the order they are
           read in on the paperwork. -->
      @if (party() === 'company') {
        <app-reactive-company-fields
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
            <p appErrorText class="mt-1">{{ text.nameRequired }}</p>
          }
        </div>

        <app-email-field
          inputId="contact-email"
          [control]="emailControl()"
          [label]="fields.email.label"
          [text]="emailText"
          [required]="true"
          [invalid]="errors().show(emailControl())"
        />

        <app-phone-field
          inputId="contact-phone"
          [control]="phoneControl()"
          [label]="fields.phone.label"
          [text]="phoneText"
          [required]="true"
          [invalid]="errors().show(phoneControl())"
        />

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
  /** Typed as the whole choice, not just these two: the pill hands back
   * what the page holds, and the page also knows about the account. */
  protected readonly kinds: readonly SegmentOption<Party>[] = inject(
    DEPLOYMENT_CONFIG,
  ).customerTypes.map((value) => ({
    value,
    label: this.partyChoice[value],
  }));

  /** The same messages the sign-up form shows for the same fields. */
  protected readonly emailText = {
    required: this.fields.email.required,
    invalid: this.fields.email.invalid,
  };
  protected readonly phoneText = {
    required: this.fields.phone.required,
    incomplete: this.fields.phone.incomplete,
  };
  protected readonly companyText = {
    idLabel: this.fields.companyId.label,
    nameLabel: this.fields.companyName.label,
    idFormat: this.fields.companyId.format,
    idRequired: this.fields.companyId.required,
    nameRequired: this.fields.companyName.required,
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
