import { ORDER_STATUSES } from '@b2b-catalog-platform/shared';
import {
  OrderStatusLabels,
  orderStatusLabel,
  orderStatusTone,
  StaffPaymentLabels,
  staffPaymentBadge,
} from './order-status';

const labels: OrderStatusLabels = {
  statusRequested: 'Awaiting confirmation',
  statusApproved: 'Confirmed',
  statusReadyDelivery: 'On its way',
  statusReadyPickup: 'Ready to collect',
  statusCompleted: 'Complete',
  statusDeclined: 'Declined',
  statusCancelled: 'Cancelled',
};

describe('orderStatusLabel', () => {
  it('reads one ready state two ways', () => {
    expect(orderStatusLabel('ready', 'pickup', labels)).toBe(
      'Ready to collect',
    );
    expect(orderStatusLabel('ready', 'delivery', labels)).toBe('On its way');
  });

  it('words every other status the same whichever way it arrives', () => {
    for (const status of ORDER_STATUSES.filter((s) => s !== 'ready')) {
      expect(orderStatusLabel(status, 'pickup', labels)).toBe(
        orderStatusLabel(status, 'delivery', labels),
      );
    }
  });

  it('never leaves a status without words', () => {
    for (const status of ORDER_STATUSES) {
      expect(orderStatusLabel(status, 'delivery', labels)).toBeTruthy();
    }
  });
});

describe('orderStatusTone', () => {
  it('makes a requested order amber for staff and informational for a customer', () => {
    expect(orderStatusTone('requested', 'staff', 'delivery')).toBe('waiting');
    expect(orderStatusTone('requested', 'customer', 'delivery')).toBe('info');
  });

  /** The customer's one amber: an order waiting on the shelf is the only
   * status that asks them to do something. */
  it('makes a pickup waiting to be collected the customer’s amber, and nobody else’s', () => {
    expect(orderStatusTone('ready', 'customer', 'pickup')).toBe('waiting');
    expect(orderStatusTone('ready', 'customer', 'delivery')).toBe('info');
    expect(orderStatusTone('ready', 'staff', 'pickup')).toBe('info');
  });

  /** An accepted order is open work to the shop and good news to the one who
   * placed it — the shop's blue is the customer's green. */
  it('makes an acceptance blue for staff and green for a customer', () => {
    for (const status of ['approved'] as const) {
      expect(orderStatusTone(status, 'staff', 'delivery')).toBe('info');
      expect(orderStatusTone(status, 'customer', 'delivery')).toBe('ok');
    }
  });

  /** The split is exactly these four statuses wide: everything else is the
   * same fact on both screens, and a fifth divergence should be a decision,
   * not a slip. */
  it('reads every other status the same way for both', () => {
    const split = ['requested', 'ready', 'approved'];
    const shared = ORDER_STATUSES.filter((status) => !split.includes(status));
    for (const status of shared) {
      expect(orderStatusTone(status, 'customer', 'delivery')).toBe(
        orderStatusTone(status, 'staff', 'delivery'),
      );
    }
  });

  it('never leaves a status without a tone', () => {
    for (const status of ORDER_STATUSES) {
      for (const fulfilment of ['delivery', 'pickup'] as const) {
        expect(orderStatusTone(status, 'customer', fulfilment)).toBeTruthy();
        expect(orderStatusTone(status, 'staff', fulfilment)).toBeTruthy();
      }
    }
  });
});

const paymentLabels: StaffPaymentLabels = {
  paymentAwaiting: 'Awaiting payment',
  paymentCash: 'Cash on handover',
  paymentPaid: 'Paid',
};

const money = (
  status: (typeof ORDER_STATUSES)[number],
  paymentState: 'not-due' | 'awaiting' | 'paid',
  paymentMethod: 'cash' | 'bank-transfer' = 'bank-transfer',
) => staffPaymentBadge({ status, paymentState, paymentMethod }, paymentLabels);

/**
 * The staff money column. What is pinned is where the amber goes: on this
 * screen it means "your move", and the money is only the shop's move once the
 * order is finished and still unpaid.
 */
describe('staffPaymentBadge', () => {
  it('calls out a finished order that is not paid, whichever way it was to be', () => {
    expect(money('completed', 'not-due', 'cash')).toEqual({
      label: 'Cash on handover',
      tone: 'waiting',
    });
    expect(money('completed', 'awaiting')).toEqual({
      label: 'Awaiting payment',
      tone: 'waiting',
    });
  });

  it('keeps an order still being worked on quiet', () => {
    expect(money('approved', 'awaiting')).toEqual({
      label: 'Awaiting payment',
      tone: 'neutral',
    });
    expect(money('ready', 'not-due', 'cash')).toEqual({
      label: 'Cash on handover',
      tone: 'neutral',
    });
  });

  it('says nothing where nothing is owed', () => {
    // An unanswered order owes nothing yet, and a refused one never will.
    expect(money('requested', 'not-due', 'cash')).toBeNull();
    expect(money('cancelled', 'not-due', 'cash')).toBeNull();
  });

  it('is settled once the money is recorded', () => {
    expect(money('completed', 'paid', 'cash')).toEqual({
      label: 'Paid',
      tone: 'ok',
    });
  });
});
