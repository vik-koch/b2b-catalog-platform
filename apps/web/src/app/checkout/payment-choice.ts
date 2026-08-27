import { Component, inject, input, output } from '@angular/core';
import { PaymentMethod } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { ChoiceCard } from '../ui/choice-card';

/**
 * How the order is paid (FR-CART-04) — **recorded, never executed**. Nothing
 * on this page charges anybody; the method is what the manager arranges once
 * the request is confirmed, and no wording here may suggest a transaction.
 *
 * Cards, like the fulfilment row above: both choices are worth a sentence, and
 * a dropdown has nowhere to put one.
 *
 * Two options rather than three. Card payment is reachable only after a manager
 * approves the request (FR-CART-06), so it is not a choice that can be made
 * here. Bank transfer invoices a legal entity, so it needs a company party —
 * shown greyed with the reason rather than hidden, or a customer who came for
 * it would think the shop dropped it. The server re-checks the same rule at
 * submission; this row only saves them the trip.
 */
@Component({
  selector: 'app-payment-choice',
  imports: [ChoiceCard],
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-3 font-medium">{{ text.heading }}</legend>

      <div class="grid gap-3 sm:grid-cols-2" role="radiogroup">
        <app-choice-card
          name="payment"
          value="cash"
          [title]="text.cashTitle"
          [description]="text.cashDescription"
          [checked]="method() === 'cash'"
          (chosen)="methodChange.emit('cash')"
        />

        <app-choice-card
          name="payment"
          value="bank-transfer"
          [title]="text.transferTitle"
          [description]="
            transferAllowed()
              ? text.transferDescription
              : text.transferCompanyOnly
          "
          [checked]="method() === 'bank-transfer'"
          [disabled]="!transferAllowed()"
          (chosen)="methodChange.emit('bank-transfer')"
        />
      </div>
    </fieldset>
  `,
})
export class PaymentChoice {
  protected readonly text = inject(APP_TEXT).checkout.payment;

  readonly method = input.required<PaymentMethod>();
  /** Whether the party being invoiced is a company — the page's answer, since
   * it is the one holding both the choice and the account. */
  readonly transferAllowed = input(false);

  readonly methodChange = output<PaymentMethod>();
}
