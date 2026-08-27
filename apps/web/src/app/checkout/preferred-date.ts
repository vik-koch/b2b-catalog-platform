import { Component, inject, input, output } from '@angular/core';
import { FulfilmentMethod } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { FieldLabel } from '../ui/field-label';
import { Icon } from '../ui/icons/icon';
import { Input } from '../ui/input';

/**
 * When the customer would like the order (FR-CART-07) — a wish, not a booking.
 * Scheduling is settled between customer and manager, so this is a date beside
 * the order rather than a window anything reserves — which "preferred" in the
 * label already says, without a sentence under the field repeating it.
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
  imports: [FieldLabel, Icon, Input],
  host: { class: 'block' },
  template: `
    <label [for]="id" appFieldLabel>
      {{ method() === 'pickup' ? text.pickupLabel : text.deliveryLabel }}
      <span class="font-normal text-subtle">({{ optional }})</span>
    </label>
    <!-- Our glyph replaces the browser's, rather than sitting beside it: the
         native button is drawn differently in every engine and pinned to the
         right edge, where no other field in the app keeps its affordance.
         Hidden, not removed — the control is still a real date input, and
         clicking anywhere in it opens the same picker. -->
    <div class="relative flex max-w-56 items-center">
      <app-icon
        name="calendar"
        class="pointer-events-none absolute left-3 h-4 w-4 text-subtle"
      />
      <input
        [id]="id"
        type="date"
        [min]="today"
        [value]="date() ?? ''"
        appInput
        class="w-full pl-9 [&::-webkit-calendar-picker-indicator]:hidden"
        (click)="openPicker($event)"
        (change)="picked($event)"
      />
    </div>
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

  /** Opens the native picker from a click anywhere in the field, since the
   * button that would have done it is hidden. Guarded: `showPicker` is absent
   * on older engines and refuses outside a user gesture, and a field that
   * still takes typing is a working field either way. */
  protected openPicker(event: Event): void {
    const input = event.target as HTMLInputElement;
    try {
      input.showPicker?.();
    } catch {
      // Nothing to do: the date can still be typed.
    }
  }

  protected picked(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.dateChange.emit(value || null);
  }
}
