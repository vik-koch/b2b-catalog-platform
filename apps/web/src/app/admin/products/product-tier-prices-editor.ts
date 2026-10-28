import { Component, computed, inject, input } from '@angular/core';
import { type FieldTree } from '@angular/forms/signals';
import { moneyFormat } from '@b2b-catalog-platform/shared';
import { CustomerTier } from '@b2b-catalog-platform/shared/admin';
import { currencySymbol, parsePriceInput } from '../../shared/catalog/price';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { FieldLabel } from '../../shared/ui/field-label';
import { FORM_FIELDS } from '../../shared/ui/form-fields';
import { PriceField } from '../../shared/ui/price-field';
import { UnitField } from '../../shared/ui/unit-field';
import { UnitFieldInput } from '../../shared/ui/unit-field-input';
import { LockedFieldMarker } from '../ownership/locked-field-marker';
import { Hint } from '../../shared/ui/hint';

/** A tier's field as the form holds it: raw text, empty meaning "no override". */
export interface TierPriceDraft {
  tierId: string;
  /** Major units as typed. Empty string = this tier uses the base price. */
  value: string;
}

/**
 * The per-tier price fields of the product editor (FR-AUTH-05), one per tier
 * in the order the form holds them.
 *
 * Values stay as *typed text* rather than numbers, because the distinction the
 * model needs is "empty" versus "priced", and a half-typed decimal has to
 * survive being read back. The parent converts to minor units on save, exactly
 * as it does for the base price — and drops a zero, which is no price rather
 * than a price of nothing, the same reading the base field gets.
 *
 * Only the deployment's own tiers appear. The base list is not among them: it
 * is the product's own price field above — so an empty tier field shows that
 * field's price as its placeholder, tracking it keystroke by keystroke. It is
 * what the tier would actually be charged, which a fixed "0" would not be, and
 * it says so in the currency's own shape. Only while there is no base price to
 * show does it fall back to naming the field.
 */
@Component({
  selector: 'app-product-tier-prices-editor',
  imports: [
    FORM_FIELDS,
    FieldLabel,
    PriceField,
    UnitField,
    LockedFieldMarker,
    Hint,
    UnitFieldInput,
  ],
  template: `
    <span appFieldLabel>
      {{ text.heading }}
      <app-locked-field-marker [field]="field()" />
    </span>
    <!-- A line each below sm, as the base price above them takes: a row of
         10rem fields on a phone is a row of fields with more chrome than value
         in them, and the form reads as one column of prices either way.

         Boxed at that width, and only there: stacked, the tiers read as three
         more fields of the product form rather than as one question with one
         answer per tier. The outline is what puts them back together; side by
         side they are already a group and the box would only be a box around a
         row. -->
    <div
      class="flex flex-wrap gap-4 rounded-md border border-edge p-4
             sm:gap-6 sm:rounded-none sm:border-0 sm:p-0"
    >
      @for (draft of field()().value(); track draft.tierId; let i = $index) {
        <app-field
          class="w-full sm:w-auto"
          [field]="field()[i].value"
          [label]="labelFor(draft.tierId)"
          [controlId]="'tier-price-' + draft.tierId"
        >
          <!-- Text with inputmode, for the same reason as the base price
               field: a number input drops a half-typed decimal. -->
          <app-unit-field class="w-full sm:w-43.5" [unit]="currencySuffix">
            <input
              type="text"
              inputmode="decimal"
              appPriceField
              appUnitFieldInput
              [placeholder]="placeholder()"
              [formField]="field()[i].value"
              (blur)="onBlur(i)"
            />
          </app-unit-field>
        </app-field>
      }
    </div>
    @if (!disabled()) {
      <span appHint class="mt-1">{{ text.hint }}</span>
    }
  `,
})
export class ProductTierPricesEditor {
  protected readonly text = inject(ADMIN_TEXT).products.editor.tierPrices;
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));
  /** The same mark the base price field above carries. */
  protected readonly currencySuffix = currencySymbol(this.currency);

  readonly tiers = input.required<CustomerTier[]>();
  /** The base price as text, e.g. "18,90" — empty while none is entered. */
  readonly basePrice = input('');
  readonly field = input.required<FieldTree<TierPriceDraft[]>>();

  /** Read-only while an external system sets the prices (FR-ADM-10). */
  protected readonly disabled = computed(() => this.field()().disabled());

  protected readonly placeholder = computed(
    () => this.basePrice() || this.text.usesBase,
  );

  protected labelFor(tierId: string): string {
    return this.tiers().find((tier) => tier.id === tierId)?.label ?? '';
  }

  /**
   * Empties a field left at zero. A price of nothing is no price, and the way
   * this editor says "no price" is an empty field — so the field is put into
   * that state as soon as it is left, rather than saving something that reads
   * as a free product and quietly storing something else.
   */
  protected onBlur(index: number): void {
    const value = this.field()[index].value();
    if (parsePriceInput(value.value(), this.currency) === 0) {
      value.value.set('');
    }
  }
}
