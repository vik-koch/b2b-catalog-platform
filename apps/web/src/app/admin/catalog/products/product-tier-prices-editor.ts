import { Component, computed, inject, input } from '@angular/core';
import { type FieldTree } from '@angular/forms/signals';
import { moneyFormat, currencySymbol } from '@b2b-catalog-platform/shared';
import { CustomerTier } from '@b2b-catalog-platform/shared/admin/catalog';
import {
  parsePriceInput,
  partialPriceRule,
} from '../../../core/catalog/pricing/price';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { Allow } from '@b2b-catalog-platform/ui/inputs/allow';
import { UnitInput } from '@b2b-catalog-platform/ui/inputs/unit-input';
import { UnitInputControl } from '@b2b-catalog-platform/ui/inputs/unit-input-control';
import { LockedFieldMarker } from '../../ownership/locked-field-marker';
import { Hint } from '@b2b-catalog-platform/ui/fields/hint';

export interface TierPriceDraft {
  tierId: string;
  /** Major units as typed, so a half-typed decimal survives; empty uses the
   * base price. */
  value: string;
}

/**
 * The product's price on each tier but the storefront's (FR-AUTH-05), whose
 * price is the field above. An empty field shows that price as its
 * placeholder, which is what the tier is charged.
 */
@Component({
  selector: 'app-product-tier-prices-editor',
  imports: [
    FORM_FIELDS,
    FieldLabel,
    Allow,
    UnitInput,
    LockedFieldMarker,
    Hint,
    UnitInputControl,
  ],
  template: `
    <span uiFieldLabel>
      {{ text.heading }}
      <app-locked-field-marker [field]="field()" />
    </span>
    <!-- A line each below sm, and boxed only there: stacked, the tiers would
         read as more product fields rather than one answer per tier. -->
    <div
      class="flex flex-wrap gap-4 rounded-md border border-edge p-4
             sm:gap-6 sm:rounded-none sm:border-0 sm:p-0"
    >
      @for (draft of field()().value(); track draft.tierId; let i = $index) {
        <ui-field
          class="w-full sm:w-auto"
          [field]="field()[i].value"
          [label]="labelFor(draft.tierId)"
          [controlId]="'tier-price-' + draft.tierId"
        >
          <!-- Text, not number: a number input drops a half-typed decimal. -->
          <ui-unit-input class="w-full sm:w-43.5" [unit]="currencySuffix">
            <input
              type="text"
              inputmode="decimal"
              [uiAllow]="partialPrice"
              uiUnitInputControl
              [placeholder]="placeholder()"
              [formField]="field()[i].value"
              (blur)="onBlur(i)"
            />
          </ui-unit-input>
        </ui-field>
      }
    </div>
    @if (!disabled()) {
      <span uiHint class="mt-1">{{ text.hint }}</span>
    }
  `,
})
export class ProductTierPricesEditor {
  protected readonly text = inject(ADMIN_TEXT).products.editor.tierPrices;
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));
  protected readonly currencySuffix = currencySymbol(this.currency);
  protected readonly partialPrice = partialPriceRule(this.currency);

  readonly tiers = input.required<CustomerTier[]>();
  /** As typed, e.g. "18,90"; empty while none is entered. */
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

  /** A zero is no price, which this editor writes as an empty field: emptied
   * on leaving, rather than reading as free and saving as unpriced. */

  protected onBlur(index: number): void {
    const value = this.field()[index].value();
    if (parsePriceInput(value.value(), this.currency) === 0) {
      value.value.set('');
    }
  }
}
