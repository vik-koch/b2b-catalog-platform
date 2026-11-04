import { inject } from '@angular/core';
import { SharedText } from '@b2b-catalog-platform/shared/platform';
import {
  OrderAddress,
  OrderDetail,
} from '@b2b-catalog-platform/shared/core/ordering';
import { formatPhone } from '../../platform/contact-fields';
import { addressLines } from '@b2b-catalog-platform/shared/core/accounts';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { STOREFRONT_TEXT } from '../../platform/config/storefront-text';
import { ReviewBlock } from './ui/order-read-back';

/**
 * The wording one screen puts on an order's answers. Passed in rather than
 * injected: customer and staff read the same order and must not see it
 * described differently.
 */
export interface OrderBlockLabels {
  readonly fulfilment: string;
  readonly delivery: string;
  readonly pickup: string;
  readonly invoice: string;
  /** The invoice went where the goods went, which is the ordinary case. */
  readonly billingSame: string;
  readonly deliveryDate: string;
  readonly pickupDate: string;
  readonly whenAny: string;
  readonly payment: string;
  readonly cash: string;
  readonly transfer: string;
  /** A card payment arranged with the manager. Only staff set it, and it must
   * not read as cash. */
  readonly card: string;
  readonly contact: string;
  readonly note: string;
}

/** The shared names, plus the payment methods, the note and the two sentences
 * the reader's own text words. */
export function orderBlockLabels(
  names: SharedText,
  view: Pick<
    OrderBlockLabels,
    'billingSame' | 'whenAny' | 'note' | 'cash' | 'transfer' | 'card'
  >,
): OrderBlockLabels {
  const order = names.order;
  return {
    billingSame: view.billingSame,
    whenAny: view.whenAny,
    note: view.note,
    cash: view.cash,
    transfer: view.transfer,
    card: view.card,
    fulfilment: names.fulfilment.label,
    delivery: names.fulfilment.delivery,
    pickup: names.fulfilment.pickup,
    invoice: order.invoicedTo,
    deliveryDate: order.preferredDelivery,
    pickupDate: order.preferredPickup,
    payment: order.payment,
    contact: order.contact,
  };
}

/** The labels a customer reads an order under; call in an injection context. */
export function injectCustomerBlockLabels(): OrderBlockLabels {
  const names = inject(SHARED_TEXT);
  const review = inject(STOREFRONT_TEXT).checkout.review;
  return orderBlockLabels(names, {
    billingSame: review.billingSame,
    whenAny: review.whenAny,
    note: names.order.note,
    ...names.order.paymentMethods,
  });
}

/** What turning the order's own fields into lines needs from the deployment. */
export interface OrderBlockConfig {
  readonly address: Parameters<typeof addressLines>[1];
  readonly phoneInput: Parameters<typeof formatPhone>[1];
  readonly locale: string;
}

/**
 * An order's answers as blocks, in the order checkout asked the questions.
 * Every value is a snapshot on the order: the order as it stood, not what the
 * catalogue, address book or config say today.
 */
export function orderBlocks(
  // Without the documents, so an order version reads back through it too.
  order: Omit<OrderDetail, 'documents'>,
  labels: OrderBlockLabels,
  config: OrderBlockConfig,
): ReviewBlock[] {
  const lines = (address: OrderAddress | null): string[] =>
    address ? addressLines(asAddress(address), config.address) : [];

  const arrival = order.pickup
    ? [labels.pickup, order.pickup.name, order.pickup.address]
    : [labels.delivery, ...lines(order.deliveryAddress)];

  const party = order.party.registrationId
    ? `${order.party.name} · ${order.party.registrationId}`
    : order.party.name;
  // Empty where the order carries no invoice address: the deployment asks for
  // none, or the order predates it asking.
  const billing =
    order.deliveryAddress &&
    lines(order.deliveryAddress).join('\n') ===
      lines(order.billingAddress).join('\n')
      ? [labels.billingSame]
      : lines(order.billingAddress);

  const blocks: ReviewBlock[] = [
    { heading: labels.fulfilment, lines: arrival },
    { heading: labels.invoice, lines: [party, ...billing] },
    {
      heading: order.pickup ? labels.pickupDate : labels.deliveryDate,
      lines: [
        order.preferredDate
          ? formatDay(order.preferredDate, config.locale)
          : labels.whenAny,
      ],
    },
    {
      heading: labels.payment,
      lines: [
        {
          'bank-transfer': labels.transfer,
          'card-later': labels.card,
          cash: labels.cash,
        }[order.paymentMethod],
      ],
    },
    {
      // Not on the checkout's read-back, where the contact is whoever fills
      // the form. Afterwards it says who takes the call: maybe a colleague.
      heading: labels.contact,
      lines: [
        order.contact.name,
        order.contact.email,
        formatPhone(order.contact.phone, config.phoneInput),
      ],
    },
  ];
  if (order.customerNote) {
    blocks.push({ heading: labels.note, lines: [order.customerNote] });
  }

  // A blank line would be a claim that something was answered with nothing.
  return blocks.map((block) => ({
    ...block,
    lines: block.lines.filter((line) => line.trim().length > 0),
  }));
}

/** A snapshot has no label, id or timestamps; addressLines reads only the
 * place. */
function asAddress(address: OrderAddress) {
  return { ...address, label: null, id: '', createdAt: '', updatedAt: '' };
}

/** A preferred date carries no time: parsed as an instant, it shifts a day
 * with the timezone. */
function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
    new Date(`${iso}T00:00:00`),
  );
}
