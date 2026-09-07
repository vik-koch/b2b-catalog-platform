import { ORDER_STATUSES } from '@b2b-catalog-platform/shared';
import {
  OrderStatusLabels,
  orderStatusLabel,
  orderStatusTone,
} from './order-status';

const labels: OrderStatusLabels = {
  statusRequested: 'Awaiting confirmation',
  statusApproved: 'Confirmed',
  statusAdjusted: 'Confirmed with changes',
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
    for (const status of ['approved', 'adjusted'] as const) {
      expect(orderStatusTone(status, 'staff', 'delivery')).toBe('info');
      expect(orderStatusTone(status, 'customer', 'delivery')).toBe('ok');
    }
  });

  /** The split is exactly these four statuses wide: everything else is the
   * same fact on both screens, and a fifth divergence should be a decision,
   * not a slip. */
  it('reads every other status the same way for both', () => {
    const split = ['requested', 'ready', 'approved', 'adjusted'];
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
