import { Component, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { CompanyFields } from '../parties/company-fields';
import { ChoiceBranch } from '../ui/choice-branch';
import { Input } from '../ui/input';
import { FieldLabel } from '../ui/field-label';
import { SEGMENTED_GROUP, segmentClass } from '../ui/segmented';
import { PartyChoice as Party } from './checkout-draft.service';

/**
 * Who the order is invoiced to (FR-CART-09) — a field of the order, not a
 * property of an address. An order invoiced to one party at another's address
 * is an ordinary order, and folding the identity into the address would either
 * contradict the row the customer picked or quietly rewrite it.
 *
 * Two options, not three: the account's own party, and anybody else. What kind
 * of party that is asks itself inside the second one, on the same switch
 * registration puts at the top of its own form — a person is a name, a company
 * is a name and a registration number, both required on the rule registration
 * applies, which is why no sole-trader case has to be told apart. Asking the
 * kind as a third radio put a question about the answer beside the question it
 * answers.
 *
 * Anybody but the account is priced provisionally: the customer's agreed prices
 * belong to their account and not to whoever is being invoiced.
 */
@Component({
  selector: 'app-party-choice',
  imports: [
    ChoiceBranch,
    CompanyFields,
    FieldLabel,
    Input,
    ReactiveFormsModule,
  ],
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-2 font-medium">{{ text.heading }}</legend>

      <div class="space-y-2" role="radiogroup">
        <app-choice-branch
          name="party"
          value="account"
          [checked]="party() === 'account'"
          (chosen)="partyChange.emit('account')"
        >
          <!-- The account's own name. The page holds the row back until the
               profile has answered, so this is never a word standing in for a
               name about to replace it; the neutral one is for an account that
               has no name to show. -->
          <span branchLabel>{{ accountName() ?? text.own }}</span>
        </app-choice-branch>

        <app-choice-branch
          name="party"
          value="other"
          [checked]="party() !== 'account'"
          [framed]="party() !== 'account'"
          (chosen)="partyChange.emit(otherParty())"
        >
          <span branchLabel>{{ text.other }}</span>

          @if (party() !== 'account') {
            <div class="space-y-4">
              <div role="radiogroup" [class]="group">
                @for (kind of kinds; track kind) {
                  <label [class]="segment(kind)">
                    <input
                      type="radio"
                      class="sr-only"
                      name="party-kind"
                      [value]="kind"
                      [checked]="party() === kind"
                      (change)="partyChange.emit(kind)"
                    />
                    {{ kind === 'person' ? text.person : text.company }}
                  </label>
                }
              </div>

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
                    [formControl]="personNameControl()"
                    [attr.aria-invalid]="personNameInvalid() || null"
                  />
                  @if (personNameInvalid()) {
                    <p class="mt-1 text-sm text-red-600">
                      {{ text.nameRequired }}
                    </p>
                  }
                </div>
              } @else {
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
              }

              <p class="text-sm text-amber-700">{{ text.otherNotice }}</p>
            </div>
          }
        </app-choice-branch>
      </div>
    </fieldset>
  `,
})
export class PartyChoice {
  /** Sign-up's wording, whole: the same pair of fields asking the same thing
   * of the same kind of party, and a second copy of it would be two ways of
   * saying which numbers are accepted. */
  private readonly registerText = inject(APP_TEXT).auth.register;

  protected readonly text = inject(APP_TEXT).checkout.party;
  protected readonly kinds = ['person', 'company'] as const;
  protected readonly group = SEGMENTED_GROUP;
  protected readonly companyText = {
    ...this.registerText.companySuggest,
    idLabel: this.registerText.companyId,
    nameLabel: this.registerText.companyName,
    // No hint here, unlike registration: which numbers are accepted is
    // something to read while opening an account, not a paragraph to step over
    // on the way to sending an order. A wrong one still says so.
    idFormat: this.registerText.validation.companyIdFormat,
    idRequired: this.registerText.validation.companyIdRequired,
    nameRequired: this.registerText.validation.companyNameRequired,
  };

  readonly party = input.required<Party>();
  /**
   * What the account is registered as — its company, or its holder's name
   * where it registered as a person. Resolved by the page, which holds the
   * profile.
   */
  readonly accountName = input<string | null>(null);
  /** Which kind the second option falls back to, so leaving it and coming
   * back does not undo the switch. */
  readonly otherParty = input<Party>('person');
  /**
   * A control per field rather than one name shared by both branches: a person
   * and a company are two answers, and typing one into the other's field
   * because the customer changed their mind is a name nobody entered there.
   */
  readonly personNameControl = input.required<FormControl<string>>();
  readonly companyNameControl = input.required<FormControl<string>>();
  readonly companyIdControl = input.required<FormControl<string>>();
  readonly personNameInvalid = input(false);
  readonly companyNameInvalid = input(false);
  readonly companyIdInvalid = input(false);

  readonly partyChange = output<Party>();
  readonly picked = output<PartySuggestion>();

  protected segment(kind: Party): string {
    return segmentClass(this.party() === kind ? 'selected' : 'available');
  }
}
