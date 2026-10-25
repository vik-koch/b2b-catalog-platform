import {
  CommonText,
  OrderAddress,
  OrderDetail,
} from '@b2b-catalog-platform/shared';
import { formatPhone } from '../core/contact-fields';
import { addressLines } from '../addresses/address-format';
import { ReviewBlock } from './order-read-back';

/**
 * The wording one screen puts on an order's answers. Passed in rather than
 * injected: the customer and staff read the same order, mostly in shared
 * names, and it must not be described differently by the two.
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
  /** A card payment arranged with the manager. Staff-set — the checkout does
   * not offer it — and it is neither of the other two, so an order paid that
   * way must not read as one paid in cash. */
  readonly card: string;
  readonly contact: string;
  readonly note: string;
}

/**
 * The block labels: the shared names, plus what the reader's own text says —
 * the payment methods, the note, and the screen's two sentences.
 */
export function orderBlockLabels(
  names: CommonText,
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

/** The labels a customer reads an order under. */
export function customerBlockLabels(
  names: CommonText,
  review: Pick<OrderBlockLabels, 'billingSame' | 'whenAny'>,
): OrderBlockLabels {
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
 * An order's answers as blocks, in the order checkout asked the questions —
 * reading an order back is walking down the form that was filled in.
 *
 * Every value comes off the order itself. All of them are snapshots, so this is
 * the order as it stood and not what the catalogue, the address book or the
 * deployment's config say today.
 */
export function orderBlocks(
  // Everything but the documents, so one *version* of an order reads back
  // through the same function: what an order carries is a fact about the
  // order, not about the version being read.
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
  // Nothing at all where the order carries no invoice address — the
  // deployment invoices none of its own, or the order predates it asking.
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
      // Not on the checkout's own read-back, where the contact is whoever is
      // filling the form. Afterwards it is what says who takes the call — and
      // it may well be a colleague.
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

/** A snapshot has no label, no id and no timestamps; the writer only wants the
 * place. */
function asAddress(address: OrderAddress) {
  return { ...address, label: null, id: '', createdAt: '', updatedAt: '' };
}

/** An ISO date read as a day rather than as an instant: a preferred date
 * carries no time, and parsing it as one moves it a timezone either way. */
function formatDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
    new Date(`${iso}T00:00:00`),
  );
}
