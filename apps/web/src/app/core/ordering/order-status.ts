import {
  awaitsPaymentRecord,
  FulfilmentMethod,
  OrderStatus,
  PaymentMethod,
  PaymentState,
} from '@b2b-catalog-platform/shared/core/ordering';
import { StatusTone } from '@b2b-catalog-platform/ui/content/status-badge';

/** Who is looking at the badge. */
export type OrderAudience = 'customer' | 'staff';

/**
 * The status words, one set per reader under the same keys (`order.statuses`
 * in the shared text, `orders.statuses` in the admin text). `ready` is one
 * state with two keys: the fulfilment method picks the sentence.
 */
export interface OrderStatusLabels {
  readonly requested: string;
  readonly approved: string;
  readonly readyDelivery: string;
  readonly readyPickup: string;
  readonly completed: string;
  readonly declined: string;
  readonly cancelled: string;
}

export function orderStatusLabel(
  status: OrderStatus,
  fulfilment: FulfilmentMethod,
  labels: OrderStatusLabels,
): string {
  if (status === 'ready') {
    return fulfilment === 'pickup' ? labels.readyPickup : labels.readyDelivery;
  }
  return labels[status];
}

/**
 * The badge tone per status. It answers "is this mine to move?" and nothing
 * finer: amber when the reader has to act, blue in flight, green settled. So
 * a requested order is amber for staff only, and `ready` is amber for a
 * customer only when it waits for them to collect it.
 */
export function orderStatusTone(
  status: OrderStatus,
  audience: OrderAudience,
  fulfilment: FulfilmentMethod,
): StatusTone {
  if (status === 'ready') {
    return audience === 'customer' && fulfilment === 'pickup'
      ? 'waiting'
      : 'info';
  }
  const tones: Record<Exclude<OrderStatus, 'ready'>, StatusTone> = {
    requested: audience === 'staff' ? 'waiting' : 'info',
    // Good news to the customer, open work to staff.
    approved: audience === 'staff' ? 'info' : 'ok',
    completed: 'ok',
    declined: 'danger',
    cancelled: 'neutral',
  };
  return tones[status];
}

/** The payment words, one set per reader (`paymentStates`). */
export interface OrderPaymentLabels {
  readonly awaiting: string;
  readonly paid: string;
}

/** Plus the staff-only cash order nobody has ticked yet. */
export interface StaffPaymentLabels extends OrderPaymentLabels {
  readonly cashOnHandover: string;
}

/** The customer's payment badge, or null while nothing is due: a "nothing
 * due" badge is noise. */
export function orderPaymentLabel(
  state: PaymentState,
  labels: OrderPaymentLabels,
): string | null {
  if (state === 'awaiting') return labels.awaiting;
  return state === 'paid' ? labels.paid : null;
}

/**
 * The customer's payment tone: amber while they owe, green once paid. Drawn
 * as a `dot`: two solid pills side by side read as statuses that disagree.
 */
export function orderPaymentTone(state: PaymentState): StatusTone {
  if (state === 'awaiting') return 'waiting';
  return state === 'paid' ? 'ok' : 'neutral';
}

/**
 * The staff payment badge, or null where there is nothing to say.
 *
 * A taken cash order stays `not-due` until the handover is ticked, so it says
 * so: otherwise it looks unanswered. Amber only for a finished, unpaid order
 * (`awaitsPaymentRecord`), the shop's last move; everything in flight is
 * `neutral`, as an "act now" colour that stays true for days stops meaning
 * anything.
 */
export function staffPaymentBadge(
  order: {
    paymentState: PaymentState;
    paymentMethod: PaymentMethod;
    status: OrderStatus;
  },
  labels: StaffPaymentLabels,
): { label: string; tone: StatusTone } | null {
  if (order.paymentState === 'paid') {
    return { label: labels.paid, tone: 'ok' };
  }
  // One job either way: an unticked handover or money that never arrived.
  if (awaitsPaymentRecord(order.status, order.paymentState)) {
    return {
      label:
        order.paymentMethod === 'cash'
          ? labels.cashOnHandover
          : labels.awaiting,
      tone: 'waiting',
    };
  }
  if (order.paymentState === 'awaiting') {
    return { label: labels.awaiting, tone: 'neutral' };
  }
  const owedInCash =
    order.paymentMethod === 'cash' &&
    order.status !== 'requested' &&
    order.status !== 'declined' &&
    order.status !== 'cancelled';
  return owedInCash ? { label: labels.cashOnHandover, tone: 'neutral' } : null;
}
