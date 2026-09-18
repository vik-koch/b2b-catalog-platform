import {
  ENDED_ORDER_STATUSES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHODS_DUE_ON_ACCEPTANCE,
  PAYMENT_STATES,
} from './order-constants';

/**
 * Who may move an order where (FR-ORD-02), as one table.
 *
 * It lives in shared because both sides need the same answer for different
 * reasons: the API refuses a transition the table does not allow, and the UI
 * draws exactly the controls the table permits. Two copies of a workflow
 * diverge — a button for a move the server refuses, or worse a move the server
 * allows and nobody thought to guard.
 *
 * The table is the rule, and it is only about *moves*. Changing what an order
 * says is a separate operation with its own payload and no target status at
 * all (FR-ORD-03): an adjusted order stands exactly where it stood.
 */

type OrderStatusName = (typeof ORDER_STATUSES)[number];
type PaymentMethodName = (typeof PAYMENT_METHODS)[number];
type PaymentStateName = (typeof PAYMENT_STATES)[number];

/**
 * Who is asking — not which role. `customer` is the account that owns the
 * order; both staff roles answer orders alike, so a manager and an admin are
 * one actor here. A guest holds a read link, which is not an actor at all: the
 * token opens the summary and moves nothing.
 *
 * `machine` is an owning system writing back what has become of an order it
 * was handed (FR-ADM-08). It is a third actor rather than a second name for
 * staff because it answers a different question. A manager clicks one step at
 * a time and each click *is* an event; an exchange polls every few minutes and
 * reports a **state**, so an order accepted and packed between two polls
 * arrives as one fact. See the table below for what follows from that.
 */
export type OrderActor = 'customer' | 'staff' | 'machine';

const NONE: readonly OrderStatusName[] = [];

/**
 * Every status names what it may become, so a status added to `ORDER_STATUSES`
 * cannot compile without someone deciding where it leads — including the
 * decision that it leads nowhere.
 *
 * A customer may call off an order the shop has not answered yet. Once it has
 * been accepted the shop is working on it, and stopping it is a phone call —
 * including when the shop changed it, because a change is agreed on that same
 * call before it is ever written down.
 *
 * Every move runs backwards as well as forwards, one step at a time, and for
 * one reason: staff's undo. A click made by accident must not leave an order
 * at the wrong answer for good — and without a step back, the only recovery
 * from "ready" clicked too early would be to cancel the order and reopen it,
 * which tells the customer their order was called off when it never was.
 *
 * Backwards is a move like any other — it writes a version and the customer's
 * view follows it. What it does not do on its own is write to them: the mail
 * is a decision taken per move (`notifyByDefault`), and an undo is the shop
 * correcting itself rather than news.
 */
const TRANSITIONS: Record<
  OrderActor,
  Record<OrderStatusName, readonly OrderStatusName[]>
> = {
  staff: {
    requested: ['approved', 'declined', 'cancelled'],
    approved: ['ready', 'requested', 'cancelled'],
    ready: ['completed', 'approved', 'cancelled'],
    // An ending goes back to the one state that asks the shop to answer again:
    // there is no telling which of the earlier steps it was ended from, and
    // the answer it needs is the whole of it.
    completed: ['ready', 'requested'],
    declined: ['requested'],
    cancelled: ['requested'],
  },
  customer: {
    requested: ['cancelled'],
    approved: NONE,
    ready: NONE,
    completed: NONE,
    declined: NONE,
    cancelled: NONE,
  },
  /**
   * An owning system reports where an order **is**, so it may name any other
   * position on the chain in one move — `requested` straight to `ready` for an
   * order accepted and packed between two polls.
   *
   * Staff's one-step rule exists because a click is an event and every event
   * needs an undo. A poll is not a sequence of events: the states an order
   * passed through between two of them were never witnessed here, and the
   * alternative to this row is every adapter keeping an event queue in order
   * to replay a history the platform would be inventing either way. One report
   * becomes one version, landing where the order actually is.
   *
   * **An ending reopens to anywhere on the chain**, for the same reason. An
   * order refused here, then reopened and accepted in the other system between
   * two polls, comes back as `approved`; forcing it through `requested` first
   * would file a version saying the shop is deciding, which is a state nobody
   * was ever in. Staff reopen to `requested` alone because a manager clicking
   * "reopen" has not yet answered it — the exchange is reporting that somebody
   * over there already did.
   *
   * Two limits stay. `declined` is a refusal *before* acceptance, so it is
   * reachable only from `requested` — an order already being worked is stopped
   * by `cancelled`, which is reachable from anywhere on the chain. And a
   * `completed` order cannot be cancelled: the goods are gone, and whatever
   * happens next is a return in the shop's own books rather than a state here.
   *
   * What none of this reaches is a cancellation the **customer** made. That is
   * refused before this table is consulted, so widening these rows never hands
   * the exchange a way to drive a called-off order forward.
   */
  machine: {
    requested: ['approved', 'ready', 'completed', 'declined', 'cancelled'],
    approved: ['ready', 'completed', 'requested', 'cancelled'],
    ready: ['completed', 'approved', 'requested', 'cancelled'],
    completed: ['ready', 'approved', 'requested'],
    declined: ['requested', 'approved', 'ready', 'completed'],
    cancelled: ['requested', 'approved', 'ready', 'completed'],
  },
};

/** What this actor may move this order to, in the order it is offered. */
export function allowedTransitions(
  actor: OrderActor,
  from: OrderStatusName,
): readonly OrderStatusName[] {
  return TRANSITIONS[actor][from];
}

export function canTransition(
  actor: OrderActor,
  from: OrderStatusName,
  to: OrderStatusName,
): boolean {
  return TRANSITIONS[actor][from].includes(to);
}

/**
 * Which moves have a reason at all: the two ways an order ends. Every other
 * move is self-explaining — an accepted order needs no note to justify being
 * accepted.
 */
export function transitionHasReason(to: OrderStatusName): boolean {
  return (ENDED_ORDER_STATUSES as readonly OrderStatusName[]).includes(to);
}

/**
 * Which moves are *refused* without one.
 *
 * Only the shop's. A refusal the shop makes is quoted at the customer, and
 * being told no without being told why is the answer nobody can act on. A
 * customer calling their own order off owes the shop nothing: the reason is
 * useful — somebody may already be packing it — but asking for it is a
 * courtesy asked, not a condition imposed, and a required field there is a
 * customer stuck on their own cancel button.
 *
 * An owning system is the shop here, so it owes the same answer: an order
 * declined or called off by the back office reaches the customer as a refusal,
 * and one without a reason is a refusal nobody can act on.
 */
export function transitionNeedsReason(
  to: OrderStatusName,
  actor: OrderActor,
): boolean {
  return actor !== 'customer' && transitionHasReason(to);
}

/**
 * The order's forward chain. The two refusals are off it, and moving off it is
 * never "back": a declined order reopened is answered again from the start.
 */
const FORWARD: readonly OrderStatusName[] = [
  'requested',
  'approved',
  'ready',
  'completed',
];

/**
 * Which way a move runs — the next step in the order's life, or staff undoing
 * a click.
 *
 * Both ends have to be on the chain. Refusing an order is not a step back
 * along it: it leaves the chain altogether, and reopening a refused order
 * rejoins it at the start. Shared because three things read it and all three
 * must agree: the button's wording and weight, the mail's framing, and whether
 * writing to the customer is offered ticked.
 */
export function moveDirection(
  from: OrderStatusName,
  to: OrderStatusName,
): 'forward' | 'backward' {
  const was = FORWARD.indexOf(from);
  const now = FORWARD.indexOf(to);
  return was >= 0 && now >= 0 && now < was ? 'backward' : 'forward';
}

/**
 * Whether a move offers to write to the customer with the box already ticked
 * (FR-NOTIF-03).
 *
 * The mail is the one thing on this screen nobody can take back, so it is
 * asked rather than inferred — but asked with the answer already filled in for
 * the case that is almost always right: **news they have not had yet**. A step
 * forward to a state the shop has never written to them about is news; every
 * other move is the shop putting its own record straight.
 *
 * That is what makes a finished order quiet. Completed, then reopened,
 * corrected and completed again offers the tick only on the first completion:
 * the customer has already been told the order is done, and telling them twice
 * describes a lap of the workflow they never saw. It is a default and not a
 * rule — a manager who reopened an order for a real reason ticks the box.
 */
export function notifyByDefault(
  from: OrderStatusName,
  to: OrderStatusName,
  /** The statuses the customer has already been written to about. */
  notified: readonly OrderStatusName[],
): boolean {
  return moveDirection(from, to) === 'forward' && !notified.includes(to);
}

/**
 * What the money says after an adjustment — which is whatever the order now
 * owes, unless somebody has recorded that it arrived.
 *
 * A recorded payment survives every change: it is an observation about the
 * world, not a derived figure, and a manager who repriced an order does not
 * un-receive the money. Everything else is re-derived from the method the
 * order now carries, so switching an accepted order from cash to bank transfer
 * makes it owed and switching it back stops it being. The status is the one
 * the order already had — an adjustment moves nothing.
 */
export function paymentStateAfterAdjustment(
  state: PaymentStateName,
  status: OrderStatusName,
  method: PaymentMethodName,
): PaymentStateName {
  return state === 'paid' ? 'paid' : paymentStateWithoutPayment(status, method);
}

/**
 * What a transition does to the second axis (ADR 0050) — the whole rule, in
 * two lines.
 *
 * Accepting an order makes the invoiced methods due. Ending one un-dues what
 * was never paid, so a cancelled order stops counting as money the shop is
 * waiting for. Cash appears in neither: it exists only at the handover, which
 * is a manager recording a payment and not a transition at all. And no
 * transition walks `paid` back: a refund happens in the shop's books, and a
 * mis-tick is corrected by clearing the record itself
 * (`paymentStateWithoutPayment`), not by moving the order.
 */
export function nextPaymentState(
  state: PaymentStateName,
  method: PaymentMethodName,
  to: OrderStatusName,
): PaymentStateName {
  const ended = (ENDED_ORDER_STATUSES as readonly OrderStatusName[]).includes(
    to,
  );

  // What the state the order *lands in* owes, asked of the one function that
  // answers that — rather than asked of the move. A move may now skip states
  // (see the `machine` row above), so "did this transition accept the order"
  // is the wrong question: an order taken straight from `requested` to
  // `completed` passed through acceptance without a transition saying so, and
  // an invoiced one owes money all the same.
  if (
    state === 'not-due' &&
    paymentStateWithoutPayment(to, method) === 'awaiting'
  ) {
    return 'awaiting';
  }
  if (state === 'awaiting' && ended) return 'not-due';
  return state;
}

/**
 * What an order owes when no payment is recorded on it — the state a cleared
 * payment falls back to.
 *
 * It is derived, not remembered: nothing stores what the payment state was
 * before a manager ticked the box, and it does not need to. An invoiced order
 * the shop has accepted is owed money whether or not somebody once said it
 * had arrived; anything else — a cash order, or one still waiting for an
 * answer — is not due yet.
 */
export function paymentStateWithoutPayment(
  status: OrderStatusName,
  method: PaymentMethodName,
): PaymentStateName {
  const dueOnAcceptance = (
    PAYMENT_METHODS_DUE_ON_ACCEPTANCE as readonly PaymentMethodName[]
  ).includes(method);
  const answered =
    !(ENDED_ORDER_STATUSES as readonly OrderStatusName[]).includes(status) &&
    status !== 'requested';
  return dueOnAcceptance && answered ? 'awaiting' : 'not-due';
}

/**
 * Whether an order is finished but its money is not — the one piece of work
 * the two axes only name together (ADR 0050).
 *
 * A handed-over order nobody has recorded a payment for is the shop's move and
 * nobody else's: the goods are gone and the tick is all that is left. It is
 * deliberately about *any* unpaid ending, not about cash — an invoiced order
 * completed and never settled is the same open item, and a method special case
 * here would be a third reading of the payment axis.
 *
 * `completed` alone, since an order that ended in a refusal owes nothing: the
 * shop is not chasing money on an order it never filled.
 *
 * Three readers, and they must agree or a count links to a list that
 * contradicts it: the work queue's `COUNT`, the staff list's `unpaid` filter,
 * and the tone of the payment badge on the row.
 */
export function awaitsPaymentRecord(
  status: OrderStatusName,
  state: PaymentStateName,
): boolean {
  return status === 'completed' && state !== 'paid';
}
