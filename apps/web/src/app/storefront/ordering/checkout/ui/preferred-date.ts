import { Component, computed, inject, input, output } from '@angular/core';

import {
  firstOrderDate,
  FulfilmentMethod,
} from '@b2b-catalog-platform/shared/core/ordering';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { DateInput } from '@b2b-catalog-platform/ui/inputs/date-input';

import { SHARED_ORDERING_TEXT } from '../../../../core/ordering/ordering-text';
import { SHARED_TEXT } from '../../../../platform/config/shared-text';
import { STOREFRONT_ORDERING_TEXT } from '../../ordering-text';

/** When the customer would like the order (FR-CART-07): a wish, not a booking;
 * optional. A native date field. Days on offer follow `order-dates` from the
 * shop's today. `min` still offers weekends, so the rule is said under the
 * field and checked; the error replaces the hint. */
@Component({
  selector: 'app-preferred-date',
  imports: [DateInput, FieldLabel],
  host: { class: 'block' },
  template: `
    <label [for]="id" uiFieldLabel>
      {{
        method() === 'pickup' ? names.preferredPickup : names.preferredDelivery
      }}
      <span class="font-normal text-ink-subtle">({{ optional }})</span>
    </label>
    <ui-date-input
      class="max-w-70"
      [fieldId]="id"
      [value]="date()"
      [min]="floor()"
      [placeholder]="text.placeholder"
      [invalid]="invalid()"
      [describedBy]="id + '-hint'"
      (valueChange)="dateChange.emit($event)"
    />
    <p
      [id]="id + '-hint'"
      class="mt-1 text-sm"
      [class]="invalid() ? 'text-danger' : 'text-ink-subtle'"
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
  protected readonly text = inject(STOREFRONT_ORDERING_TEXT).checkout.timing;
  protected readonly names = inject(SHARED_ORDERING_TEXT).order;
  protected readonly optional = inject(SHARED_TEXT).optional;
  protected readonly id = 'preferred-date';

  /** A delivery is brought, a pickup collected. */
  readonly method = input.required<FulfilmentMethod>();
  /** ISO `YYYY-MM-DD`, or null. */
  readonly date = input.required<string | null>();
  /** The page's answer, as it refuses the submission. */
  readonly invalid = input(false);

  readonly dateChange = output<string | null>();

  /** The shop's today, as the page holds it. */
  readonly today = input.required<string>();

  protected readonly floor = computed(() => firstOrderDate(this.today()));
}
