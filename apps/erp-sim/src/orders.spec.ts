import { Order, stepsFor } from './orders';

const now = new Date('2026-10-23T12:00:00Z');
const order = (overrides: Partial<Order>): Order => ({
  reference: 'SL-1',
  status: 'requested',
  paymentState: 'not-due',
  revisionNumber: 3,
  // Two hours before `now`.
  statusChangedAt: '2026-10-23T10:00:00Z',
  ...overrides,
});

describe('stepsFor', () => {
  it('takes each open order one step on, told to the customer', () => {
    const steps = stepsFor(
      [
        order({ reference: 'R', status: 'requested' }),
        order({ reference: 'A', status: 'approved', paymentState: 'awaiting' }),
        order({ reference: 'Y', status: 'ready', paymentState: 'awaiting' }),
      ],
      now,
      1,
    );
    expect(steps).toEqual([
      {
        reference: 'R',
        basedOnRevision: 3,
        status: 'approved',
        notify: true,
        showCustomer: true,
      },
      {
        reference: 'A',
        basedOnRevision: 3,
        status: 'ready',
        notify: true,
        showCustomer: true,
      },
      // Handed over and paid in one instruction: one version, one message.
      {
        reference: 'Y',
        basedOnRevision: 3,
        status: 'completed',
        paid: true,
        notify: true,
        showCustomer: true,
      },
    ]);
  });

  it('leaves an order that moved within the hour where it is', () => {
    expect(
      stepsFor([order({ statusChangedAt: '2026-10-23T11:30:00Z' })], now, 1),
    ).toEqual([]);
  });

  it('settles a handed-over order still owed, quietly', () => {
    expect(
      stepsFor(
        [order({ status: 'completed', paymentState: 'awaiting' })],
        now,
        1,
      ),
    ).toEqual([
      {
        reference: 'SL-1',
        basedOnRevision: 3,
        paid: true,
        notify: false,
        showCustomer: false,
      },
    ]);
  });

  it('does not record a payment twice', () => {
    expect(
      stepsFor([order({ status: 'ready', paymentState: 'paid' })], now, 1)[0],
    ).not.toHaveProperty('paid');
    expect(
      stepsFor([order({ status: 'completed', paymentState: 'paid' })], now, 1),
    ).toEqual([]);
  });

  it('leaves refused and called-off orders alone', () => {
    expect(
      stepsFor(
        [order({ status: 'declined' }), order({ status: 'cancelled' })],
        now,
        1,
      ),
    ).toEqual([]);
  });
});
