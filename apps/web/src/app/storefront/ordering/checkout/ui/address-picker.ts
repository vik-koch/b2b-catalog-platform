import { Component, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { STOREFRONT_TEXT } from '../../../../platform/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../../../platform/config/deployment-config';
import { SUGGESTIONS_ENABLED } from '../../../../platform/config/suggestions-enabled';
import { AddressFields } from '../../../../core/accounts/addresses/address-fields';
import { AddressForm } from '../../../../core/accounts/addresses/address-form';
import {
  addressDetailLines,
  addressDisplayName,
} from '../../../../core/accounts/addresses/address-format';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { TickLabel } from '@b2b-catalog-platform/ui/choices/tick-label';
import { ChoiceBranch } from '@b2b-catalog-platform/ui/choices/choice-branch';
import {
  Address,
  AddressComponents,
} from '@b2b-catalog-platform/shared/core/accounts';

/** Unique per instance: a delivery and a billing picker share the page. */
let nextId = 0;

/** One address, picked from the book or typed (FR-CART-04/11). Rows read as the
 * account page writes them. With an empty book the fields stand alone in an
 * untitled card. No identity here: the party is its own row. */
@Component({
  selector: 'app-address-picker',
  imports: [AddressFields, Checkbox, TickLabel, ChoiceBranch, NgTemplateOutlet],
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-2 font-medium">{{ heading() }}</legend>

      @if (addresses().length === 0) {
        <!-- No book: the fields are the whole picker. -->
        <div class="space-y-4 rounded-md border border-edge p-4">
          <ng-container [ngTemplateOutlet]="addressFields" />
        </div>
      } @else {
        <div class="space-y-2" role="radiogroup">
          @for (address of addresses(); track address.id) {
            <ui-choice-branch
              [name]="group"
              [value]="address.id"
              [checked]="selectedId() === address.id"
              (chosen)="selectedIdChange.emit(address.id)"
            >
              <span branchLabel>{{ name(address) }}</span>
              <span branchLabel class="text-sm text-ink-subtle">
                {{ lines(address) }}
              </span>
            </ui-choice-branch>
          }

          <!-- Framed while chosen, or the save tick box below would read as one
               more option. -->
          <ui-choice-branch
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
          </ui-choice-branch>
        </div>
      }

      <ng-template #addressFields>
        <!-- No label: at checkout an address is named by its street line. -->
        <app-address-fields
          [form]="form()"
          [showLabel]="false"
          [compact]="suggests"
          [reveal]="reveal()"
          (picked)="picked.emit($event)"
        />
        <!-- Only where there is a book to save to. -->
        @if (canSave()) {
          <label uiTickLabel>
            <input
              type="checkbox"
              uiCheckbox
              [checked]="save()"
              (change)="saveChange.emit(!save())"
            />
            <span>{{ text.saveToBook }}</span>
          </label>
        }
      </ng-template>

      <!-- The page's additions: the zone hint or the invoice checkbox. -->
      <ng-content />
    </fieldset>
  `,
})
export class AddressPicker {
  private readonly instance = nextId++;
  private readonly addressConfig = inject(DEPLOYMENT_CONFIG).address;

  protected readonly text = inject(STOREFRONT_TEXT).checkout.addresses;
  /** With suggestions, checkout asks for the street alone; the account editor
   * stays whole. */
  protected readonly suggests = inject(SUGGESTIONS_ENABLED);
  protected readonly group = `address-picker-${this.instance}`;

  readonly heading = input.required<string>();
  readonly addresses = input.required<readonly Address[]>();
  /** The chosen row, or null for the one being typed. */
  readonly selectedId = input.required<string | null>();
  readonly form = input.required<AddressForm>();
  readonly canSave = input(true);
  /** Unfolds the compact fields the page found invalid. */
  readonly reveal = input(false);
  readonly save = input(true);

  readonly selectedIdChange = output<string | null>();
  readonly saveChange = output<boolean>();
  readonly picked = output<AddressComponents>();

  protected name(address: Address): string {
    return addressDisplayName(address);
  }

  /** The row's lines on one line: a list to scan. */
  protected lines(address: Address): string {
    return addressDetailLines(address, this.addressConfig).join(', ');
  }
}
