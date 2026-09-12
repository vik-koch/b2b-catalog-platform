import { Component, computed, inject, input, output } from '@angular/core';
import { CustomerTier } from '@b2b-catalog-platform/shared';
import { currencySymbol, parsePriceInput } from '../../catalog/price';
import { ADMIN_TEXT } from '../../config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { FieldLabel } from '../../ui/field-label';
import { PriceField } from '../../ui/price-field';
import { UNIT_FIELD_INPUT, UnitField } from '../../ui/unit-field';
import { LockedFieldMarker } from '../ownership/locked-field-marker';

/** A tier's field as the form holds it: raw text, empty meaning "no override". */
export interface TierPriceDraft {
  tierId: string;
  /** Major units as typed. Empty string = this tier uses the base price. */
  value: string;
}

/**
 * The per-tier price fields of the product editor (FR-AUTH-05).
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
  imports: [FieldLabel, PriceField, UnitField, LockedFieldMarker],
  template: `
    <span appFieldLabel>
      {{ text.heading }}
      @if (disabled()) {
        <app-locked-field-marker />
      }
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
      class="flex flex-wrap gap-4 rounded-md border border-border p-4 sm:gap-6 sm:rounded-none sm:border-0 sm:p-0"
    >
      @for (tier of tiers(); track tier.id) {
        <label class="block w-full sm:w-auto">
          <span class="mb-1 block text-sm text-muted">{{ tier.label }}</span>
          <!-- Text with inputmode, for the same reason as the base price
               field: a number input drops a half-typed decimal. -->
          <app-unit-field class="w-full sm:w-40" [unit]="currencySuffix">
            <input
              type="text"
              inputmode="decimal"
              appPriceField
              [class]="unitFieldInput"
              [attr.aria-label]="tier.label"
              [value]="valueFor(tier.id)"
              [placeholder]="placeholder()"
              [disabled]="disabled()"
              (input)="onInput(tier.id, $any($event.target).value)"
              (blur)="onBlur(tier.id, $any($event.target).value)"
            />
          </app-unit-field>
        </label>
      }
    </div>
    <span class="mt-1 block text-xs text-subtle">{{ text.hint }}</span>
  `,
})
export class ProductTierPricesEditor {
  protected readonly text = inject(ADMIN_TEXT).productEditor.tierPrices;
  protected readonly unitFieldInput = UNIT_FIELD_INPUT;
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  /** The same mark the base price field above carries. */
  protected readonly currencySuffix = currencySymbol(this.currency);

  readonly tiers = input.required<CustomerTier[]>();
  /** The base price as text, e.g. "18,90" — empty while none is entered. */
  readonly basePrice = input('');
  readonly value = input.required<TierPriceDraft[]>();
  /** Read-only while an external system sets the prices (FR-ADM-10). */
  readonly disabled = input(false);
  readonly valueChange = output<TierPriceDraft[]>();

  protected readonly placeholder = computed(
    () => this.basePrice() || this.text.usesBase,
  );

  private readonly byTier = computed(
    () => new Map(this.value().map((d) => [d.tierId, d.value])),
  );

  protected valueFor(tierId: string): string {
    return this.byTier().get(tierId) ?? '';
  }

  /**
   * Empties a field left at zero. A price of nothing is no price, and the way
   * this editor says "no price" is an empty field — so the field is put into
   * that state as soon as it is left, rather than saving something that reads
   * as a free product and quietly storing something else.
   */
  protected onBlur(tierId: string, value: string): void {
    // Read off the field rather than out of the draft: the draft is the
    // parent's signal coming back down, and a blur that follows the last
    // keystroke closely enough arrives before it has.
    if (parsePriceInput(value, this.currency) === 0) this.onInput(tierId, '');
  }

  protected onInput(tierId: string, value: string): void {
    const next = this.value().filter((d) => d.tierId !== tierId);
    // An emptied field is dropped rather than kept as an empty string, so the
    // saved payload and the dirty snapshot both mean the same thing by absence.
    if (value.trim() !== '') next.push({ tierId, value });
    // Sorted, because the parent's dirty check is a JSON snapshot: without a
    // stable order, editing two tiers and undoing one would still read dirty.
    next.sort((a, b) => a.tierId.localeCompare(b.tierId));
    this.valueChange.emit(next);
  }
}
