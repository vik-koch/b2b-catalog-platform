import {
  awaitsPaymentRecord,
  FulfilmentMethod,
  OrderStatus,
  PaymentMethod,
  PaymentState,
} from '@b2b-catalog-platform/shared';
import { StatusTone } from '../ui/status-badge';

/** Who is looking at the badge. */
export type OrderAudience = 'customer' | 'staff';

/**
 * The words a deployment puts on the statuses. Both catalogues carry these
 * keys under the same names — the public one for customers and the admin one
 * for staff — so one function serves both and the two cannot drift into
 * describing different workflows.
 *
 * `ready` is two keys and one state (ADR 0050): a collected order is waiting
 * to be picked up, a delivered one is on its way. Which sentence is read is
 * decided by the order's own fulfilment method, never by a second status.
 */
export interface OrderStatusLabels {
  readonly statusRequested: string;
  readonly statusApproved: string;
  readonly statusReadyDelivery: string;
  readonly statusReadyPickup: string;
  readonly statusCompleted: string;
  readonly statusDeclined: string;
  readonly statusCancelled: string;
}

export function orderStatusLabel(
  status: OrderStatus,
  fulfilment: FulfilmentMethod,
  labels: OrderStatusLabels,
): string {
  const ready =
    fulfilment === 'pickup'
      ? labels.statusReadyPickup
      : labels.statusReadyDelivery;
  return {
    requested: labels.statusRequested,
    approved: labels.statusApproved,
    ready,
    completed: labels.statusCompleted,
    declined: labels.statusDeclined,
    cancelled: labels.statusCancelled,
  }[status];
}

/**
 * The badge tone per status, shared by every screen that lists orders.
 *
 * Three levels, not a ramp from yellow to green: the colour answers "is this
 * mine to move?" and nothing finer. Amber is the shop's own inbox, blue is an
 * order that is agreed and in flight, and only a settled order is green. An
 * accepted order and one waiting on a shelf share a colour — the difference
 * between them is a word to read, not a thing to count across a room.
 *
 * Amber means somebody has to act, and who that somebody is decides the
 * colour. For staff a requested order is their queue. For a customer it is a
 * fact about where the order stands — they cannot answer their own order — and
 * their amber is the one status that genuinely waits on them: an order packed
 * and waiting to be collected. An order out for delivery waits on nobody, so
 * the same state is a plain fact when it is being brought to them.
 *
 * The tone is shared; the wording is not — a customer reads "Awaiting
 * confirmation" where staff read the state itself, and the two texts live in
 * their own catalogues.
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
    // Green for the customer, blue for staff: an order the shop has taken on
    // is good news to the one who placed it and open work to the one who has
    // to fill it.
    approved: audience === 'staff' ? 'info' : 'ok',
    completed: 'ok',
    declined: 'danger',
    cancelled: 'neutral',
  };
  return tones[status];
}

/**
 * The two things worth saying about the money in a listing. Both catalogues
 * carry these keys, as they do the status ones — staff scan the same column a
 * customer reads on their own order.
 */
export interface OrderPaymentLabels {
  readonly paymentAwaiting: string;
  readonly paymentPaid: string;
}

/** What staff read on top of that: the cash order nobody has ticked yet. */
export interface StaffPaymentLabels extends OrderPaymentLabels {
  readonly paymentCash: string;
}

/**
 * What the payment badge says, or null where there is nothing to say: an
 * order with nothing due yet — a cash one, or one still waiting for an answer
 * — is not a fact about money, and a badge reading "nothing due" is a column
 * of noise to scan past.
 */
export function orderPaymentLabel(
  state: PaymentState,
  labels: OrderPaymentLabels,
): string | null {
  if (state === 'awaiting') return labels.paymentAwaiting;
  return state === 'paid' ? labels.paymentPaid : null;
}

/**
 * The customer's reading: amber where they still owe something, green where
 * it is settled.
 *
 * Green here and grey in the staff column, which is the one place the two
 * audiences deliberately differ. For a manager scanning a hundred rows, a paid
 * order is simply a row with nothing left on it — colouring it would spend the
 * column's only strong tone on the state most rows are in. A customer looks at
 * one order, and "we have your money" is the whole of what they came to check.
 *
 * Always drawn in the quiet `dot` variant, wherever it appears: the payment is
 * the order's second fact, and two solid pills side by side read as two
 * statuses that might disagree. The dot was written for exactly this — a
 * colour to scan down a column rather than one to shout from a card.
 */
export function orderPaymentTone(state: PaymentState): StatusTone {
  if (state === 'awaiting') return 'waiting';
  return state === 'paid' ? 'ok' : 'neutral';
}

/**
 * The money badge as staff read it, or null where there is nothing to say.
 *
 * One reading more than a customer gets: a cash order the shop has taken on
 * sits in `not-due` until somebody records the handover, which looks exactly
 * like an unanswered order does. It is the one the manager has to come back to
 * — the goods go out and the tick is the only thing left — so it is said out
 * loud rather than left as an empty cell. A cash order still waiting for an
 * answer says nothing: nothing is owed on an order the shop has not taken.
 *
 * Amber is spent on one reading only: an order **finished** and not paid for
 * (`awaitsPaymentRecord`), which is the shop's own last move and the one thing
 * in this column nobody else can finish. Everything still in flight is quiet —
 * an accepted order is owed money the whole time it is being packed, and a
 * colour that means "act now" spent on a fact that stays true for days stops
 * meaning anything. That is also why the in-flight readings are `neutral`
 * rather than `info`: now that the panel counts the finished-and-unpaid ones
 * and the badge marks them, the rest of this column is a fact to read, not a
 * state to point at.
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
    return { label: labels.paymentPaid, tone: 'ok' };
  }
  // The one call to act. Which word it wears follows the method — a finished
  // cash order is a handover nobody ticked, an invoiced one is money that
  // never arrived — but both are the same job and the same colour.
  if (awaitsPaymentRecord(order.status, order.paymentState)) {
    return {
      label:
        order.paymentMethod === 'cash'
          ? labels.paymentCash
          : labels.paymentAwaiting,
      tone: 'waiting',
    };
  }
  if (order.paymentState === 'awaiting') {
    return { label: labels.paymentAwaiting, tone: 'neutral' };
  }
  const owedInCash =
    order.paymentMethod === 'cash' &&
    order.status !== 'requested' &&
    order.status !== 'declined' &&
    order.status !== 'cancelled';
  return owedInCash ? { label: labels.paymentCash, tone: 'neutral' } : null;
}
