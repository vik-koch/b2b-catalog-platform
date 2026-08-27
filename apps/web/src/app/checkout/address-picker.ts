import { Component, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Address, AddressComponents } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { SUGGESTIONS_ENABLED } from '../config/suggestions-enabled';
import { FieldErrors } from '../core/form-errors';
import { AddressFields } from '../addresses/address-fields';
import { AddressForm } from '../addresses/address-form';
import {
  addressDetailLines,
  addressDisplayName,
} from '../addresses/address-format';
import { Checkbox } from '../ui/checkbox';
import { ChoiceBranch } from '../ui/choice-branch';

/** Ids have to be unique per instance: a delivery picker and a billing picker
 * stand on the same page. */
let nextId = 0;

/**
 * One address, chosen from the book or typed (FR-CART-04/11).
 *
 * The saved rows read the way the account page writes them — the same name and
 * the same lines — so a customer recognises the row they mean rather than
 * decoding a second rendering of it. The last option opens the ordinary
 * address fields.
 *
 * With nothing saved there is no list at all: the fields stand on their own in
 * a card with no title, because there is no option left to title it with. That
 * is what an account with an empty book sees, and what a guest will see.
 *
 * No identity is asked for here: who an order is invoiced to is one question,
 * asked once in its own row, and an address is a place.
 */
@Component({
  selector: 'app-address-picker',
  imports: [AddressFields, Checkbox, ChoiceBranch, NgTemplateOutlet],
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-2 font-medium">{{ heading() }}</legend>

      @if (addresses().length === 0) {
        <!-- Nothing to choose between, so nothing is asked: the fields are the
             whole picker, in a card of their own with no option to tick. A
             list of one option is not a question. -->
        <div class="space-y-4 rounded-md border border-border p-4">
          <ng-container [ngTemplateOutlet]="addressFields" />
        </div>
      } @else {
        <div class="space-y-2" role="radiogroup">
          @for (address of addresses(); track address.id) {
            <app-choice-branch
              [name]="group"
              [value]="address.id"
              [checked]="selectedId() === address.id"
              (chosen)="selectedIdChange.emit(address.id)"
            >
              <!-- Name and lines on one axis, the way a collection point reads:
                   what it is called, then in a quieter voice where it is. -->
              <span branchLabel>{{ name(address) }}</span>
              <span branchLabel class="text-sm text-muted">
                {{ lines(address) }}
              </span>
            </app-choice-branch>
          }

          <!-- Framed while it is the one chosen: the fields it reveals end in a
               tick box of their own, which without a frame would read as one
               more option in this list. -->
          <app-choice-branch
            [name]="group"
            value="new"
            [checked]="selectedId() === null"
            [framed]="selectedId() === null"
            (chosen)="selectedIdChange.emit(null)"
          >
            <span branchLabel>{{ text.addNew }}</span>

            @if (selectedId() === null) {
              <div class="space-y-4">
                <ng-container [ngTemplateOutlet]="addressFields" />
              </div>
            }
          </app-choice-branch>
        </div>
      }

      <!-- The same fields either way: with a book they are what the last
           option reveals, without one they are the whole picker. -->
      <ng-template #addressFields>
        <!-- No label asked for here: at checkout an address is named by its own
             street line, and inventing a word for it is a question asked for
             nothing. -->
        <app-address-fields
          [form]="form()"
          [fieldErrors]="fieldErrors()"
          [showLabel]="false"
          [compact]="suggests"
          [reveal]="reveal()"
          (picked)="picked.emit($event)"
        />
        <!-- Only where there is a book to save it to. Checked, because an
             address typed at checkout is one the customer orders to. -->
        @if (canSave()) {
          <label class="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              appCheckbox
              class="mt-0.5"
              [checked]="save()"
              (change)="saveChange.emit(!save())"
            />
            <span>{{ text.saveToBook }}</span>
          </label>
        }
      </ng-template>

      <!-- Whatever the page wants to say about the chosen address — the
           delivery zone it falls in, or the invoice checkbox. -->
      <ng-content />
    </fieldset>
  `,
})
export class AddressPicker {
  private readonly instance = nextId++;
  private readonly addressConfig = inject(DEPLOYMENT_CONFIG).address;

  protected readonly text = inject(APP_TEXT).checkout.addresses;
  /** Where a provider can fill an address in, checkout asks for the street
   * alone. The account's editor stays whole: that is where a book is curated,
   * not where an order is being placed. */
  protected readonly suggests = inject(SUGGESTIONS_ENABLED);
  protected readonly group = `address-picker-${this.instance}`;

  readonly heading = input.required<string>();
  readonly addresses = input.required<readonly Address[]>();
  /** The chosen row, or null for the one being typed. */
  readonly selectedId = input.required<string | null>();
  readonly form = input.required<AddressForm>();
  readonly fieldErrors = input.required<FieldErrors>();
  readonly canSave = input(true);
  /** Open the folded-away fields: the page found the address wanting, and what
   * is wrong with it is what the compact form is hiding. */
  readonly reveal = input(false);
  readonly save = input(true);

  readonly selectedIdChange = output<string | null>();
  readonly saveChange = output<boolean>();
  readonly picked = output<AddressComponents>();

  protected name(address: Address): string {
    return addressDisplayName(address);
  }

  /** The rest of the row, on one line: a picker is a list to scan, not a stack
   * of address blocks. */
  protected lines(address: Address): string {
    return addressDetailLines(address, this.addressConfig).join(', ');
  }
}
