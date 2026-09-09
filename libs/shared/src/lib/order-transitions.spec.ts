import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canTransition,
  moveDirection,
  nextPaymentState,
  notifyByDefault,
  paymentStateWithoutPayment,
  transitionHasReason,
  transitionNeedsReason,
} from './order-transitions';
import { ORDER_STATUSES } from './order-constants';

/**
 * The workflow rules, where they are actually decided (ADR 0050). Both sides
 * read this table — the API to refuse a move and the UI to draw the controls —
 * so what is pinned here is the shape of the rule, not one caller's use of it.
 */
describe('order transitions', () => {
  it('lets staff answer a request and nobody else', () => {
    expect(canTransition('staff', 'requested', 'approved')).toBe(true);
    expect(canTransition('staff', 'requested', 'declined')).toBe(true);
    expect(canTransition('customer', 'requested', 'approved')).toBe(false);
    expect(canTransition('customer', 'requested', 'declined')).toBe(false);
  });

  it('lets a customer call off only an order the shop has not answered', () => {
    expect(canTransition('customer', 'requested', 'cancelled')).toBe(true);
    // Once the shop has accepted it, stopping it is a phone call — including
    // on an order the shop itself changed, which was agreed on that same call.
    expect(canTransition('customer', 'approved', 'cancelled')).toBe(false);
    expect(canTransition('customer', 'ready', 'cancelled')).toBe(false);
  });

  /** Staff's undo, and the reason it is a step rather than a jump: without it
   * the only recovery from "ready" clicked too early is to cancel the order,
   * which tells the customer it was called off when it never was. */
  it('lets staff walk an order back a step, and nobody else', () => {
    expect(canTransition('staff', 'ready', 'approved')).toBe(true);
    expect(canTransition('staff', 'approved', 'requested')).toBe(true);
    expect(canTransition('staff', 'completed', 'ready')).toBe(true);
    for (const status of ORDER_STATUSES) {
      expect(allowedTransitions('customer', status)).toEqual(
        status === 'requested' ? ['cancelled'] : [],
      );
    }
  });

  it('reopens a refused order to the state that asks the shop to answer', () => {
    // Straight back to `approved` would put an order the shop refused into the
    // customer's hands as an accepted one, with nobody having answered it.
    for (const status of ['declined', 'cancelled'] as const) {
      expect(allowedTransitions('staff', status)).toEqual(['requested']);
    }
  });

  it('refuses the shop’s own endings without a reason', () => {
    expect(transitionNeedsReason('declined', 'staff')).toBe(true);
    expect(transitionNeedsReason('cancelled', 'staff')).toBe(true);
    expect(transitionNeedsReason('approved', 'staff')).toBe(false);
    expect(transitionNeedsReason('ready', 'staff')).toBe(false);
    expect(transitionNeedsReason('completed', 'staff')).toBe(false);
  });

  /** A refusal is quoted at the customer and has to explain itself. A customer
   * changing their mind explains nothing to anybody. */
  it('asks a customer why, without insisting', () => {
    expect(transitionHasReason('cancelled')).toBe(true);
    expect(transitionNeedsReason('cancelled', 'customer')).toBe(false);
  });
});

/**
 * The second axis. The point of every case here is that payment does not
 * follow the status — it is a fact of its own that some transitions touch.
 */
/**
 * Which way a move runs and whether it offers to write to the customer — one
 * rule read by the button's wording, the mail's framing and the tick in the
 * confirmation, so a disagreement between them is a disagreement here.
 */
describe('moveDirection and notifyByDefault', () => {
  it('reads a step against the chain as backwards, and leaving it as not', () => {
    expect(moveDirection('ready', 'approved')).toBe('backward');
    expect(moveDirection('completed', 'ready')).toBe('backward');
    expect(moveDirection('approved', 'ready')).toBe('forward');
    // Refusing an order is not a step back along the chain, and reopening a
    // refused one rejoins it at the start rather than moving forward along it.
    expect(moveDirection('approved', 'cancelled')).toBe('forward');
    expect(moveDirection('declined', 'requested')).toBe('forward');
  });

  it('offers the mail on news the customer has not had', () => {
    expect(notifyByDefault('requested', 'approved', [])).toBe(true);
    expect(notifyByDefault('approved', 'ready', ['requested'])).toBe(true);
  });

  it('keeps quiet on an undo and on a second lap through the same state', () => {
    // The customer has been told the order is done. Reopening it to put the
    // shop's own record straight, and finishing it again, is not a workflow
    // they have to watch twice.
    expect(notifyByDefault('completed', 'ready', ['completed'])).toBe(false);
    expect(notifyByDefault('ready', 'completed', ['completed'])).toBe(false);
    // And walking a step back is never news, even the first time.
    expect(notifyByDefault('ready', 'approved', ['approved'])).toBe(false);
    expect(notifyByDefault('ready', 'approved', [])).toBe(false);
  });
});

describe('nextPaymentState', () => {
  it('makes an invoiced order due when it is accepted', () => {
    expect(nextPaymentState('not-due', 'bank-transfer', 'approved')).toBe(
      'awaiting',
    );
    expect(nextPaymentState('not-due', 'card-later', 'approved')).toBe(
      'awaiting',
    );
  });

  it('never puts cash in the queue: it exists at the handover', () => {
    for (const to of ['approved', 'ready', 'completed'] as const) {
      expect(nextPaymentState('not-due', 'cash', to)).toBe('not-due');
    }
  });

  it('leaves an accepted order alone as it is worked on', () => {
    expect(nextPaymentState('awaiting', 'bank-transfer', 'ready')).toBe(
      'awaiting',
    );
    expect(nextPaymentState('paid', 'cash', 'completed')).toBe('paid');
  });

  it('stops waiting for money on an order that ended', () => {
    expect(nextPaymentState('awaiting', 'bank-transfer', 'cancelled')).toBe(
      'not-due',
    );
    expect(nextPaymentState('awaiting', 'card-later', 'declined')).toBe(
      'not-due',
    );
  });

  it('does not unpay a paid order that is then called off', () => {
    // Whether money goes back is a question for the shop's books, and an order
    // that was paid was paid.
    expect(nextPaymentState('paid', 'bank-transfer', 'cancelled')).toBe('paid');
  });
});

/**
 * What clearing a recorded payment falls back to. Nothing stores what the
 * state was before the box was ticked, and it does not need to: what an order
 * owes is what its method and its status say it owes.
 */
describe('paymentStateWithoutPayment', () => {
  it('owes again on an invoiced order the shop has accepted', () => {
    for (const status of ['approved', 'ready', 'completed'] as const) {
      expect(paymentStateWithoutPayment(status, 'bank-transfer')).toBe(
        'awaiting',
      );
      expect(paymentStateWithoutPayment(status, 'card-later')).toBe('awaiting');
    }
  });

  it('owes nothing on cash, whatever the order is doing', () => {
    expect(paymentStateWithoutPayment('ready', 'cash')).toBe('not-due');
    expect(paymentStateWithoutPayment('completed', 'cash')).toBe('not-due');
  });

  it('owes nothing before the shop has answered, or after it ended', () => {
    expect(paymentStateWithoutPayment('requested', 'bank-transfer')).toBe(
      'not-due',
    );
    expect(paymentStateWithoutPayment('cancelled', 'bank-transfer')).toBe(
      'not-due',
    );
  });
});
