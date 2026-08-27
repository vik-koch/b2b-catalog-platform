import { Component, inject, input, output } from '@angular/core';
import { FulfilmentMethod } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { FieldLabel } from '../ui/field-label';
import { Input } from '../ui/input';

/**
 * When the customer would like the order (FR-CART-07) — a wish, not a booking.
 * Scheduling is settled between customer and manager, so this is a date beside
 * the order rather than a window anything reserves, and the hint says so where
 * it is asked rather than in a confirmation nobody reads twice.
 *
 * A native date field: it is one date, the browser's own picker is the one the
 * customer already knows, and it hands back an ISO day with no parsing of what
 * anybody typed. Optional throughout — an order with no date is the ordinary
 * case, meaning "whenever suits you".
 *
 * Nothing before today, because a date in the past is a typo rather than a
 * wish. The floor is the browser's own day, which is the one the customer is
 * reading the field in.
 */
@Component({
  selector: 'app-preferred-date',
  imports: [FieldLabel, Input],
  host: { class: 'block' },
  template: `
    <label [for]="id" appFieldLabel>
      {{ method() === 'pickup' ? text.pickupLabel : text.deliveryLabel }}
      <span class="font-normal text-subtle">({{ optional }})</span>
    </label>
    <input
      [id]="id"
      type="date"
      [min]="today"
      [value]="date() ?? ''"
      appInput
      class="w-full max-w-56"
      (change)="picked($event)"
    />
    <p class="mt-1 text-sm text-muted">{{ text.hint }}</p>
  `,
})
export class PreferredDate {
  protected readonly text = inject(APP_TEXT).checkout.timing;
  protected readonly optional = inject(APP_TEXT).checkout.optional;
  protected readonly id = 'preferred-date';

  /** Only what the label is called: a delivery is brought, a pickup collected. */
  readonly method = input.required<FulfilmentMethod>();
  /** ISO `YYYY-MM-DD`, or null for no date at all. */
  readonly date = input.required<string | null>();

  readonly dateChange = output<string | null>();

  /** Today where the customer is, in the field's own format. `en-CA` renders
   * ISO, which `toISOString` would not — that is UTC, and a day ahead or
   * behind for most of the world for part of every day. Read once: a checkout
   * open across midnight is not worth a ticking clock. */
  protected readonly today = new Intl.DateTimeFormat('en-CA').format(
    new Date(),
  );

  protected picked(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.dateChange.emit(value || null);
  }
}
