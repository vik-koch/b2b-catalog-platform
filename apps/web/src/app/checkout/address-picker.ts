import { Component, inject, input, output } from '@angular/core';
import { Address, AddressComponents } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { FieldErrors } from '../core/form-errors';
import { AddressFields } from '../addresses/address-fields';
import { AddressForm } from '../addresses/address-form';
import {
  addressDetailLines,
  addressDisplayName,
} from '../addresses/address-format';
import { Checkbox } from '../ui/checkbox';
import { Radio } from '../ui/radio';

/** Ids have to be unique per instance: a delivery picker and a billing picker
 * stand on the same page. */
let nextId = 0;

/**
 * One address, chosen from the book or typed (FR-CART-04/11).
 *
 * The saved rows read the way the account page writes them — the same name and
 * the same lines — so a customer recognises the row they mean rather than
 * decoding a second rendering of it. The last option opens the ordinary
 * address fields, which is also the whole picker for an account with an empty
 * book and, later, for a guest who has no book at all.
 *
 * No identity is asked for here: who an order is invoiced to is one question,
 * asked once in its own row, and an address is a place.
 */
@Component({
  selector: 'app-address-picker',
  imports: [AddressFields, Checkbox, Radio],
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-2 font-medium">{{ heading() }}</legend>

      <div class="space-y-2" role="radiogroup">
        @for (address of addresses(); track address.id) {
          <label class="flex cursor-pointer items-baseline gap-2">
            <input
              type="radio"
              appRadio
              class="self-center"
              [name]="group"
              [value]="address.id"
              [checked]="selectedId() === address.id"
              (change)="selectedIdChange.emit(address.id)"
            />
            <span>
              <span>{{ name(address) }}</span>
              <span class="text-sm text-muted">{{ lines(address) }}</span>
            </span>
          </label>
        } @empty {
          <p class="text-sm text-subtle">{{ text.bookEmpty }}</p>
        }

        <label class="flex cursor-pointer items-baseline gap-2">
          <input
            type="radio"
            appRadio
            class="self-center"
            [name]="group"
            value="new"
            [checked]="selectedId() === null"
            (change)="selectedIdChange.emit(null)"
          />
          <span>{{ text.addNew }}</span>
        </label>
      </div>

      @if (selectedId() === null) {
        <div class="mt-4 ml-6 space-y-4">
          <!-- No label asked for here: at checkout an address is named by
               its own street line, and inventing a word for it is a question
               asked for nothing. -->
          <app-address-fields
            [form]="form()"
            [fieldErrors]="fieldErrors()"
            [showLabel]="false"
            [compact]="suggests"
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
        </div>
      }

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
  // TODO: implement
  protected readonly suggests = true;
  protected readonly group = `address-picker-${this.instance}`;

  readonly heading = input.required<string>();
  readonly addresses = input.required<readonly Address[]>();
  /** The chosen row, or null for the one being typed. */
  readonly selectedId = input.required<string | null>();
  readonly form = input.required<AddressForm>();
  readonly fieldErrors = input.required<FieldErrors>();
  readonly canSave = input(true);
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
