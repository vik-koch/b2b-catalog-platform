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
 * is the product's own price field above, which is also why an empty tier field
 * reads "Base price" rather than "0".
 */
@Component({
  selector: 'app-product-tier-prices-editor',
  imports: [FieldLabel, Input, PriceField],
  template: `
    <span appFieldLabel>{{ text.heading }}</span>
    <div class="flex flex-wrap gap-6">
      @for (tier of tiers(); track tier.id) {
        <label class="block">
          <span class="mb-1 block text-sm text-muted">{{ tier.label }}</span>
          <!-- Text with inputmode, for the same reason as the base price
               field: a number input drops a half-typed decimal. -->
          <input
            type="text"
            inputmode="decimal"
            appInput
            appPriceField
            class="w-40"
            [attr.aria-label]="tier.label"
            [value]="valueFor(tier.id)"
            [placeholder]="text.usesBase"
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
  readonly value = input.required<TierPriceDraft[]>();
  readonly valueChange = output<TierPriceDraft[]>();

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
