import { Component, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { CompanyFields } from '../parties/company-fields';
import { Input } from '../ui/input';
import { FieldLabel } from '../ui/field-label';
import { Radio } from '../ui/radio';
import { PartyChoice as Party } from './checkout-draft.service';

/**
 * Who the order is invoiced to (FR-CART-09) — a field of the order, not a
 * property of an address. An order invoiced to one party at another's address
 * is an ordinary order, and folding the identity into the address would either
 * contradict the row the customer picked or quietly rewrite it.
 *
 * Three answers, because each asks for something different: the account's own
 * party needs nothing, a person is a name, and a company is a name and a
 * registration number — both required, on the same rule registration applies,
 * which is why no sole-trader case has to be told apart.
 *
 * Anybody but the account is priced provisionally: the customer's agreed prices
 * belong to their account and not to whoever is being invoiced.
 */
@Component({
  selector: 'app-party-choice',
  imports: [CompanyFields, FieldLabel, Input, ReactiveFormsModule, Radio],
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-2 font-medium">{{ text.heading }}</legend>

      <div class="space-y-2" role="radiogroup">
        @for (option of options; track option.value) {
          <label class="flex cursor-pointer items-baseline gap-2">
            <input
              type="radio"
              appRadio
              class="self-center"
              name="party"
              [value]="option.value"
              [checked]="party() === option.value"
              (change)="partyChange.emit(option.value)"
            />
            <span>{{ label(option.value) }}</span>
          </label>
        }
      </div>

      @if (party() !== 'account') {
        <div class="mt-3 ml-6 space-y-2">
          @if (party() === 'person') {
            <div>
              <label for="party-personName" appFieldLabel>
                {{ text.personName }}
                <span class="text-accent" aria-hidden="true">*</span>
              </label>
              <input
                id="party-personName"
                type="text"
                autocomplete="off"
                aria-required="true"
                appInput
                class="w-full"
                [formControl]="nameControl()"
                [attr.aria-invalid]="nameInvalid() || null"
              />
              @if (nameInvalid()) {
                <p class="mt-1 text-sm text-red-600">{{ text.nameRequired }}</p>
              }
            </div>
          } @else {
            <app-company-fields
              idInputId="party-companyId"
              nameInputId="party-companyName"
              [idControl]="idControl()"
              [nameControl]="nameControl()"
              [text]="companyText"
              [required]="true"
              [idInvalid]="idInvalid()"
              [nameInvalid]="nameInvalid()"
              (picked)="picked.emit($event)"
            />
          }
          <p class="text-sm text-amber-700">{{ text.otherNotice }}</p>
        </div>
      }
    </fieldset>
  `,
})
export class PartyChoice {
  /** Sign-up's wording, whole: the same pair of fields asking the same thing
   * of the same kind of party, and a second copy of it would be two ways of
   * saying which numbers are accepted. */
  private readonly registerText = inject(APP_TEXT).auth.register;

  protected readonly text = inject(APP_TEXT).checkout.party;
  protected readonly options = [
    { value: 'account' as const },
    { value: 'person' as const },
    { value: 'company' as const },
  ];
  protected readonly companyText = {
    ...this.registerText.companySuggest,
    idLabel: this.registerText.companyId,
    nameLabel: this.registerText.companyName,
    hint: this.registerText.companyIdHint,
    idFormat: this.registerText.validation.companyIdFormat,
    idRequired: this.registerText.validation.companyIdRequired,
    nameRequired: this.registerText.validation.companyNameRequired,
  };

  readonly party = input.required<Party>();
  /**
   * What the account is registered as — its company name, or its holder's name
   * where there is none. Resolved by the page, which holds the profile; the
   * neutral word stands in only until it answers.
   */
  readonly accountName = input<string | null>(null);
  readonly nameControl = input.required<FormControl<string>>();
  readonly idControl = input.required<FormControl<string>>();
  readonly nameInvalid = input(false);
  readonly idInvalid = input(false);

  readonly partyChange = output<Party>();
  readonly picked = output<PartySuggestion>();

  protected label(option: Party): string {
    if (option === 'person') return this.text.person;
    if (option === 'company') return this.text.company;
    return this.accountName() ?? this.text.own;
  }
}
