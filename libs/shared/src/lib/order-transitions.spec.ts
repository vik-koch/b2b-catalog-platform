import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canTransition,
  nextPaymentState,
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

  it('lets a customer call off only an order the shop has not started on', () => {
    expect(canTransition('customer', 'requested', 'cancelled')).toBe(true);
    // An adjusted order is a fresh offer, so the window opens again.
    expect(canTransition('customer', 'adjusted', 'cancelled')).toBe(true);
    expect(canTransition('customer', 'approved', 'cancelled')).toBe(false);
    expect(canTransition('customer', 'ready', 'cancelled')).toBe(false);
  });

  it('treats both acceptances alike on the way forward', () => {
    for (const from of ['approved', 'adjusted'] as const) {
      expect(allowedTransitions('staff', from)).toEqual(['ready', 'cancelled']);
    }
  });

  /** Staff's undo. Not a change of mind — the recovery from a click that was
   * wrong, which without it leaves an order at the wrong answer for good. */
  it('lets staff reopen an order that ended, and nobody else', () => {
    for (const status of ['completed', 'declined', 'cancelled'] as const) {
      expect(allowedTransitions('staff', status)).toEqual(['requested']);
      expect(allowedTransitions('customer', status)).toEqual([]);
    }
  });

  it('reopens to the one state that asks the shop to answer again', () => {
    // Straight back to `approved` would put an order the shop refused into the
    // customer's hands as an accepted one, with nobody having answered it.
    for (const status of ORDER_STATUSES) {
      const back = allowedTransitions('staff', status).includes('requested');
      expect(back).toBe(
        status === 'completed' ||
          status === 'declined' ||
          status === 'cancelled',
      );
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
describe('nextPaymentState', () => {
  it('makes an invoiced order due when it is accepted', () => {
    expect(nextPaymentState('not-due', 'bank-transfer', 'approved')).toBe(
      'awaiting',
    );
    expect(nextPaymentState('not-due', 'card-later', 'adjusted')).toBe(
      'awaiting',
    );
  });

  it('never puts cash in the queue: it exists at the handover', () => {
    for (const to of ['approved', 'adjusted', 'ready', 'completed'] as const) {
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
    for (const status of [
      'approved',
      'adjusted',
      'ready',
      'completed',
    ] as const) {
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
