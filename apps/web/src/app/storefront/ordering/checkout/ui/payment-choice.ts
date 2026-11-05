import { STOREFRONT_ORDERING_TEXT } from '../../ordering-text';
import { SHARED_ORDERING_TEXT } from '../../../../core/ordering/ordering-text';
import { Component, computed, inject, input, output } from '@angular/core';
import {
  FulfilmentMethod,
  PaymentMethod,
} from '@b2b-catalog-platform/shared/core/ordering';
import { ChoiceCard } from '@b2b-catalog-platform/ui/choices/choice-card';

/** How the order is paid (FR-CART-04): **recorded, never executed**; no wording
 * may suggest a transaction. Card comes only after approval (FR-CART-06). A
 * transfer needs a company and cash a person, so each party gets one option;
 * the other is greyed with its reason, not hidden. The server re-checks both.
 * */
@Component({
  selector: 'app-payment-choice',
  imports: [ChoiceCard],
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-3 font-medium">{{ text.heading }}</legend>

      <div class="grid gap-3 sm:grid-cols-2" role="radiogroup">
        <ui-choice-card
          name="payment"
          value="cash"
          [title]="names.cash"
          [description]="cashDescription()"
          [checked]="method() === 'cash'"
          [disabled]="!cashAllowed()"
          (chosen)="methodChange.emit('cash')"
        />

        <ui-choice-card
          name="payment"
          value="bank-transfer"
          [title]="names.transfer"
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
  protected readonly text = inject(STOREFRONT_ORDERING_TEXT).checkout.payment;
  protected readonly names = inject(SHARED_ORDERING_TEXT).order.paymentMethods;

  readonly method = input.required<PaymentMethod>();
  /** Cash's wording: handed over at the door or the counter. */
  readonly fulfilment = input.required<FulfilmentMethod>();
  /** The page's answer: it holds the choice and the account. */
  readonly transferAllowed = input(false);
  readonly cashAllowed = input(true);

  readonly methodChange = output<PaymentMethod>();

  protected readonly cashDescription = computed(() => {
    if (!this.cashAllowed()) return this.text.cashPersonOnly;
    return this.fulfilment() === 'pickup'
      ? this.text.cashPickupDescription
      : this.text.cashDeliveryDescription;
  });
}
