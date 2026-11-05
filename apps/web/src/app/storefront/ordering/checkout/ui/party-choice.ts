import { ACCOUNTS_CONFIG } from '../../../../core/accounts/accounts-config';
import { STOREFRONT_ACCOUNTS_TEXT } from '../../../accounts/accounts-text';
import { Component, inject, input, output } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { NgTemplateOutlet } from '@angular/common';
import { STOREFRONT_TEXT } from '../../../../platform/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../../../platform/config/deployment-config';
import { CompanyFields } from '../../../../core/accounts/parties/company-fields';
import { ChoiceBranch } from '@b2b-catalog-platform/ui/choices/choice-branch';
import { Field } from '@b2b-catalog-platform/ui/fields/field';
import { FieldBinding } from '@b2b-catalog-platform/ui/fields/field-binding';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import {
  Segmented,
  SegmentOption,
} from '@b2b-catalog-platform/ui/choices/segmented';
import { PartyChoice as Party } from '../checkout-draft';
import { PartyAnswers } from '../checkout-forms';
import { WarningNote } from '@b2b-catalog-platform/ui/content/warning-note';

/** Who is invoiced (FR-CART-09): a field of the order, not of an address. For a
 * customer, the account's party or somebody else, whose kind (person or
 * company) is the switch registration uses. Anybody else is priced
 * provisionally: the agreed prices belong to the account. */
@Component({
  selector: 'app-party-choice',
  imports: [
    WarningNote,
    ChoiceBranch,
    CompanyFields,
    Field,
    FieldBinding,
    FormField,
    NgTemplateOutlet,
    Input,
    Segmented,
  ],
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-2 font-medium">{{ text.heading }}</legend>

      @if (guest() || !ownAllowed()) {
        <!-- No first option for a guest, nor for an account of a kind no longer
             sold to (FR-AUTH-13). -->
        <ng-container [ngTemplateOutlet]="otherParty" />
      } @else {
        <div class="space-y-2" role="radiogroup">
          <ui-choice-branch
            name="party"
            value="account"
            [checked]="party() === 'account'"
            (chosen)="partyChange.emit('account')"
          >
            <!-- The page waits for the profile; the neutral word is for an
                 account with no name. -->
            <span branchLabel>{{ accountName() ?? text.own }}</span>
          </ui-choice-branch>

          <ui-choice-branch
            name="party"
            value="other"
            [checked]="party() !== 'account'"
            [framed]="party() !== 'account'"
            (chosen)="partyChange.emit(lastOther())"
          >
            <span branchLabel>{{ text.other }}</span>

            @if (party() !== 'account') {
              <ng-container [ngTemplateOutlet]="otherParty" />
            }
          </ui-choice-branch>
        </div>
      }

      <ng-template #otherParty>
        <div class="space-y-4">
          @if (kinds.length > 1) {
            <ui-segmented
              name="party-kind"
              [options]="kinds"
              [value]="party()"
              (valueChange)="partyChange.emit($event)"
            />
          }

          @if (party() === 'person') {
            <ui-field
              [field]="partyField().personName"
              [label]="text.personName"
              controlId="party-personName"
            >
              <input
                type="text"
                autocomplete="off"
                uiInput
                class="w-full"
                [formField]="partyField().personName"
              />
            </ui-field>
          } @else {
            <!-- No hint, unlike registration: a wrong number still says so. -->
            <app-company-fields
              idInputId="party-companyId"
              nameInputId="party-companyName"
              [idField]="partyField().companyId"
              [nameField]="partyField().companyName"
            />
          }

          <!-- Only for an account, whose agreed prices this order would not
               get. -->
          @if (!guest()) {
            <ui-warning-note>{{ text.otherNotice }}</ui-warning-note>
          }
        </div>
      </ng-template>
    </fieldset>
  `,
})
export class PartyChoice {
  protected readonly text = inject(STOREFRONT_TEXT).checkout.party;
  private readonly partyChoice = inject(STOREFRONT_ACCOUNTS_TEXT).partyChoice;
  /** The whole choice type: the page holds it, account included. */
  protected readonly kinds: readonly SegmentOption<Party>[] = inject(
    ACCOUNTS_CONFIG,
  ).customerTypes.map((value) => ({
    value,
    label: this.partyChoice[value],
  }));

  readonly party = input.required<Party>();
  readonly guest = input(false);
  /** Not where the shop no longer sells to its kind (FR-AUTH-13). */
  readonly ownAllowed = input(true);
  /** Resolved by the page, which holds the profile. */
  readonly accountName = input<string | null>(null);
  /** So returning to the second option keeps its kind. */
  readonly lastOther = input<Party>('person');
  /** A field per branch, so a changed mind carries no name across. */
  readonly partyField = input.required<FieldTree<PartyAnswers>>();

  readonly partyChange = output<Party>();
}
