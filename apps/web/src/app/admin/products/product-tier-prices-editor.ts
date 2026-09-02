import { Component, computed, inject, input, output } from '@angular/core';
import { CustomerTier } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { FieldLabel } from '../../ui/field-label';
import { Input } from '../../ui/input';
import { PriceField } from '../../ui/price-field';

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
 * model needs is "empty" versus "priced" — and `0` is a legitimate price, so a
 * numeric model with a null-ish default cannot express it. The parent converts
 * to minor units on save, exactly as it does for the base price.
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
  imports: [FieldLabel, Input, PriceField],
  template: `
    <span appFieldLabel>{{ text.heading }}</span>
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
          <input
            type="text"
            inputmode="decimal"
            appInput
            appPriceField
            class="w-full sm:w-40"
            [attr.aria-label]="tier.label"
            [value]="valueFor(tier.id)"
            [placeholder]="placeholder()"
            (input)="onInput(tier.id, $any($event.target).value)"
          />
        </label>
      }
    </div>
    <span class="mt-1 block text-xs text-subtle">{{ text.hint }}</span>
  `,
})
export class ProductTierPricesEditor {
  protected readonly text = inject(ADMIN_TEXT).productEditor.tierPrices;

  readonly tiers = input.required<CustomerTier[]>();
  /** The base price as text, e.g. "18,90" — empty while none is entered. */
  readonly basePrice = input('');
  readonly value = input.required<TierPriceDraft[]>();
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
