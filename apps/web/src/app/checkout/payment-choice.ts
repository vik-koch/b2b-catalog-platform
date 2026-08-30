import { Component, computed, inject, input, output } from '@angular/core';
import { FulfilmentMethod, PaymentMethod } from '@b2b-catalog-platform/shared';
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
 * here.
 *
 * Which of the two is on offer follows from the party being invoiced, and the
 * two rules are opposites: a bank transfer invoices a legal entity, so it needs
 * a company; cash is not taken from one, which is invoiced or pays by card
 * (FR-CART-04). So a company sees one option and a private person the other —
 * each shown greyed with its reason rather than hidden, or a customer who came
 * for it would think the shop dropped it. The server re-checks both rules at
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
          [description]="cashDescription()"
          [checked]="method() === 'cash'"
          [disabled]="!cashAllowed()"
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
  /** Only what cash is called: it is handed over on the doorstep or at the
   * counter, and saying "when you receive it" to someone collecting it is the
   * wrong half of the sentence. */
  readonly fulfilment = input.required<FulfilmentMethod>();
  /** Whether the party being invoiced is a company — the page's answer, since
   * it is the one holding both the choice and the account. */
  readonly transferAllowed = input(false);
  /** The same answer read the other way: cash is for a private person. */
  readonly cashAllowed = input(true);

  readonly methodChange = output<PaymentMethod>();

  protected readonly cashDescription = computed(() => {
    if (!this.cashAllowed()) return this.text.cashPersonOnly;
    return this.fulfilment() === 'pickup'
      ? this.text.cashPickupDescription
      : this.text.cashDeliveryDescription;
  });
}
