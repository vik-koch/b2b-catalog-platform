import {
  ACCEPTED_ORDER_STATUSES,
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
 * The table is the rule; it is not the whole operation. An adjustment carries
 * a new snapshot of the order, so it is its own endpoint with its own payload,
 * and it appears here only to say who is allowed to make it.
 */

type OrderStatusName = (typeof ORDER_STATUSES)[number];
type PaymentMethodName = (typeof PAYMENT_METHODS)[number];
type PaymentStateName = (typeof PAYMENT_STATES)[number];

/**
 * Who is asking — not which role. `customer` is the account that owns the
 * order; both staff roles answer orders alike, so a manager and an admin are
 * one actor here. A guest holds a read link, which is not an actor at all: the
 * token opens the summary and moves nothing.
 */
export type OrderActor = 'customer' | 'staff';

const NONE: readonly OrderStatusName[] = [];

/**
 * Every status names what it may become, so a status added to `ORDER_STATUSES`
 * cannot compile without someone deciding where it leads — including the
 * decision that it leads nowhere.
 *
 * A customer may call off an order the shop has not started on: one still
 * waiting for an answer, or one just adjusted, which is the same offer made
 * again about a different order. Once the shop is working on it, stopping it
 * is a phone call.
 *
 * Reopening — every ended state back to `requested` — is staff's undo, and the
 * only move that runs backwards. It is not there so a shop can change its
 * mind; it is there because a click made by accident must not leave an order
 * at the wrong answer for good, with no recovery but asking the customer to
 * order again under a reference nobody quoted them.
 */
const TRANSITIONS: Record<
  OrderActor,
  Record<OrderStatusName, readonly OrderStatusName[]>
> = {
  staff: {
    requested: ['approved', 'adjusted', 'declined', 'cancelled'],
    approved: ['ready', 'cancelled'],
    adjusted: ['ready', 'cancelled'],
    ready: ['completed', 'cancelled'],
    // Every ending is undoable, back to the one state that asks the shop to
    // answer again. Not for changing its mind — for the click that was wrong:
    // an order refused by accident is otherwise stuck at the wrong answer
    // forever, and the shop's only recovery is to ask the customer to place it
    // again under a reference nobody quoted them.
    completed: ['requested'],
    declined: ['requested'],
    cancelled: ['requested'],
  },
  customer: {
    requested: ['cancelled'],
    approved: NONE,
    adjusted: ['cancelled'],
    ready: NONE,
    completed: NONE,
    declined: NONE,
    cancelled: NONE,
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
 */
export function transitionNeedsReason(
  to: OrderStatusName,
  actor: OrderActor,
): boolean {
  return actor === 'staff' && transitionHasReason(to);
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
  const dueOnAcceptance = (
    PAYMENT_METHODS_DUE_ON_ACCEPTANCE as readonly PaymentMethodName[]
  ).includes(method);
  const accepted = (
    ACCEPTED_ORDER_STATUSES as readonly OrderStatusName[]
  ).includes(to);
  const ended = (ENDED_ORDER_STATUSES as readonly OrderStatusName[]).includes(
    to,
  );

  if (state === 'not-due' && accepted && dueOnAcceptance) return 'awaiting';
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
