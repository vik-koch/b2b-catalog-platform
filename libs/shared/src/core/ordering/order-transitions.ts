import {
  ENDED_ORDER_STATUSES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHODS_DUE_ON_ACCEPTANCE,
  PAYMENT_STATES,
} from './orders';

/**
 * Who may move an order where (FR-ORD-02), as one table both apps read: the
 * API refuses what it does not allow, the UI draws only what it does. Moves
 * only: an adjustment changes what an order says, not where it stands.
 */

type OrderStatusName = (typeof ORDER_STATUSES)[number];
type PaymentMethodName = (typeof PAYMENT_METHODS)[number];
type PaymentStateName = (typeof PAYMENT_STATES)[number];

/**
 * Who is asking, not which role: both staff roles answer orders alike, and a
 * guest's link moves nothing. `machine` is an owning system reporting a state
 * per poll rather than one click per step (FR-ADM-08).
 */
export type OrderActor = 'customer' | 'staff' | 'machine';

const NONE: readonly OrderStatusName[] = [];

/**
 * Every status names what it may become, so a new status cannot compile
 * without a decision. A customer may cancel only before the shop answers.
 * Staff moves run back one step as well as forward: the undo for a click made
 * by mistake. A step back mails nobody unless asked (`notifyByDefault`).
 */
const TRANSITIONS: Record<
  OrderActor,
  Record<OrderStatusName, readonly OrderStatusName[]>
> = {
  staff: {
    requested: ['approved', 'declined', 'cancelled'],
    approved: ['ready', 'requested', 'cancelled'],
    ready: ['completed', 'approved', 'cancelled'],
    // An ending reopens to `requested`: which step it ended from is unknown.
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
   * An owning system reports where an order is, so one move may skip states
   * (accepted and packed between two polls) and an ending may reopen anywhere
   * on the chain. Two limits: `declined` only before acceptance, and no
   * cancelling a completed order. A customer's own cancellation is refused
   * before this table unless the instruction takes it back.
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

/** The two endings carry a reason; every other move explains itself. */
export function transitionHasReason(to: OrderStatusName): boolean {
  return (ENDED_ORDER_STATUSES as readonly OrderStatusName[]).includes(to);
}

/**
 * Refused without a reason: the shop's endings, the exchange's included, since
 * a refusal without a why is one nobody can act on. A customer cancelling
 * owes no reason.
 */
export function transitionNeedsReason(
  to: OrderStatusName,
  actor: OrderActor,
): boolean {
  return actor !== 'customer' && transitionHasReason(to);
}

/** The forward chain. The two endings are off it. */
const FORWARD: readonly OrderStatusName[] = [
  'requested',
  'approved',
  'ready',
  'completed',
];

/**
 * Forward, or staff undoing a click. Both ends must be on the chain: ending an
 * order leaves it, reopening rejoins at the start. The button, the mail and
 * the default tick all read this.
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
 * Whether the "write to them" box starts ticked (FR-NOTIF-03): a step forward
 * into a state they have not been told about. A second lap through
 * `completed` is not news. A default, not a rule.
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
 * A recorded payment survives an adjustment; anything else is re-derived from
 * the method the order now carries.
 */
export function paymentStateAfterAdjustment(
  state: PaymentStateName,
  status: OrderStatusName,
  method: PaymentMethodName,
): PaymentStateName {
  return state === 'paid' ? 'paid' : paymentStateWithoutPayment(status, method);
}

/**
 * What a move does to the payment axis: landing in an accepted
 * state makes invoiced methods due, an ending un-dues what was never paid, and
 * nothing walks `paid` back.
 */
export function nextPaymentState(
  state: PaymentStateName,
  method: PaymentMethodName,
  to: OrderStatusName,
): PaymentStateName {
  const ended = (ENDED_ORDER_STATUSES as readonly OrderStatusName[]).includes(
    to,
  );

  // Asked of the state it lands in, not of the move: the exchange may skip
  // acceptance on the way to `completed`.
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
 * What an order owes with no payment recorded: what a cleared payment falls
 * back to. Derived, so nothing remembers the state before the tick.
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
 * Completed and not recorded as paid, whatever the method. The work
 * queue's count, the staff list's `unpaid` filter and the payment badge must
 * agree, or a count links to a list that contradicts it.
 */
export function awaitsPaymentRecord(
  status: OrderStatusName,
  state: PaymentStateName,
): boolean {
  return status === 'completed' && state !== 'paid';
}
