import { Component, inject, input, output } from '@angular/core';
import {
  firstOrderDate,
  FulfilmentMethod,
  localToday,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DateField } from '../ui/date-field';
import { FieldLabel } from '../ui/field-label';

/**
 * When the customer would like the order (FR-CART-07) — a wish, not a booking.
 * Scheduling is settled between customer and manager, so this is a date beside
 * the order rather than a window anything reserves — which "preferred" in the
 * label already says.
 *
 * A native date field: it is one date, the browser's own picker is the one the
 * customer already knows, and it hands back an ISO day with no parsing of what
 * anybody typed. Optional throughout — an order with no date is the ordinary
 * case, meaning "whenever suits you".
 *
 * The days on offer are the ones the shop could work on (`order-dates`):
 * nothing today or earlier, and no weekend. The floor is measured from the
 * browser's own day, which is the one the customer is reading the field in.
 *
 * `min` alone does not cover it — a native picker greys out what falls before
 * the floor and offers every Saturday after it — so the rule is also said in
 * words under the field and checked when a date arrives. The message replaces
 * the hint rather than joining it: both say the same rule, and one of them is
 * about the date that is actually in the field.
 */
@Component({
  selector: 'app-preferred-date',
  imports: [DateField, FieldLabel],
  host: { class: 'block' },
  template: `
    <label [for]="id" appFieldLabel>
      {{ method() === 'pickup' ? text.pickupLabel : text.deliveryLabel }}
      <span class="font-normal text-subtle">({{ optional }})</span>
    </label>
    <app-date-field
      class="max-w-46"
      [fieldId]="id"
      [value]="date()"
      [min]="floor"
      [placeholder]="text.placeholder"
      [invalid]="invalid()"
      [describedBy]="id + '-hint'"
      (valueChange)="dateChange.emit($event)"
    />
    <p
      [id]="id + '-hint'"
      class="mt-1 text-sm"
      [class]="invalid() ? 'text-red-600' : 'text-muted'"
    >
      {{
        invalid()
          ? text.unavailable
          : method() === 'pickup'
            ? text.pickupHint
            : text.deliveryHint
      }}
    </p>
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
  /** Whether the date in the field is one the shop does not offer — the page's
   * answer, since it is what refuses the submission over it. */
  readonly invalid = input(false);

  readonly dateChange = output<string | null>();

  /** The earliest day on offer, from the customer's own today. Read once: a
   * checkout open across midnight is not worth a ticking clock. */
  protected readonly floor = firstOrderDate(localToday());
}
