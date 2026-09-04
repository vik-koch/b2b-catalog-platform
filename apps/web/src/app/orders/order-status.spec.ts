import { ORDER_STATUSES } from '@b2b-catalog-platform/shared';
import { orderStatusTone } from './order-status';

describe('orderStatusTone', () => {
  it('makes a requested order amber for staff and informational for a customer', () => {
    expect(orderStatusTone('requested', 'staff')).toBe('waiting');
    expect(orderStatusTone('requested', 'customer')).toBe('info');
  });

  /** The split is meant to be one status wide: everything else is the same
   * fact on both screens, and a second divergence should be a decision, not a
   * slip. */
  it('reads every other status the same way for both', () => {
    for (const status of ORDER_STATUSES.filter((s) => s !== 'requested')) {
      expect(orderStatusTone(status, 'customer')).toBe(
        orderStatusTone(status, 'staff'),
      );
    }
  });

  it('never leaves a status without a tone', () => {
    for (const status of ORDER_STATUSES) {
      expect(orderStatusTone(status, 'customer')).toBeTruthy();
      expect(orderStatusTone(status, 'staff')).toBeTruthy();
    }
  });
});
