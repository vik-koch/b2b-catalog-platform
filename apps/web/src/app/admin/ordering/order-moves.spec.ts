import { AdminOrderDetail } from '@b2b-catalog-platform/shared/core/ordering';
import { ConfirmCheck } from '@b2b-catalog-platform/ui/overlay/confirm-dialog';
import { ReasonRequest } from '@b2b-catalog-platform/ui/overlay/confirm.service';

import {
  MARK_PAID,
  moveOptions,
  moveRequest,
  NOTIFY,
  SHOW_CUSTOMER,
  staffMoves,
} from './order-moves';
import { defaultAdminOrderingText } from './ordering-text.fixture';

const text = defaultAdminOrderingText.orders.detail;
const actions = text.actions;

/** Only what the move rules read. */
function order(fields: Partial<AdminOrderDetail> = {}): AdminOrderDetail {
  return {
    status: 'requested',
    fulfilmentMethod: 'delivery',
    paymentState: 'not-due',
    paymentMethod: 'cash',
    documents: [],
    notifiedStatuses: ['requested'],
    personalDataRemovedAt: null,
    ...fields,
  } as AdminOrderDetail;
}

function check(
  checks: readonly ConfirmCheck[] | undefined,
  key: string,
): ConfirmCheck | undefined {
  return checks?.find((entry) => entry.key === key);
}

describe('staffMoves', () => {
  it('declines a request rather than cancelling it', () => {
    const moves = staffMoves(order(), text);
    const labels = moves.map((move) => move.label);
    expect(labels).toContain(actions.approve);
    expect(labels).toContain(actions.decline);
    expect(labels).not.toContain(actions.cancel);
    expect(moves.find((move) => move.to === 'declined')?.variant).toBe(
      'dangerOutline',
    );
  });

  it('draws a move back up the chain as a quiet undo', () => {
    const back = staffMoves(order({ status: 'ready' }), text).find(
      (move) => move.to === 'approved',
    );
    expect(back?.label).toBe(actions.backToApproved);
    expect(back?.variant).toBe('secondary');
  });

  it('words ready by fulfilment', () => {
    const ready = staffMoves(
      order({ status: 'approved', fulfilmentMethod: 'pickup' }),
      text,
    ).find((move) => move.to === 'ready');
    expect(ready?.label).toBe(actions.readyPickup);
  });

  it('offers nothing once the personal details are removed', () => {
    expect(
      staffMoves(
        order({ personalDataRemovedAt: '2026-10-01T00:00:00Z' }),
        text,
      ),
    ).toEqual([]);
  });
});

describe('moveRequest', () => {
  it('asks why an order is declined, and confirms the rest plainly', () => {
    const decline = moveRequest(order(), 'declined', text) as ReasonRequest;
    expect(decline.reasonLabel).toBe(actions.reasonLabel);
    const approve = moveRequest(order(), 'approved', text);
    expect('reasonLabel' in approve).toBe(false);
    expect(approve.confirmVariant).toBe('primary');
  });

  it('ticks the payment on handing over a cash order', () => {
    const asked = moveRequest(
      order({ status: 'ready', paymentMethod: 'cash' }),
      'completed',
      text,
    );
    expect(check(asked.checks, MARK_PAID)?.checked).toBe(true);
    const invoiced = moveRequest(
      order({ status: 'ready', paymentMethod: 'bank-transfer' }),
      'completed',
      text,
    );
    expect(check(invoiced.checks, MARK_PAID)?.checked).toBe(false);
  });

  it('offers no payment tick on an ending or a paid order', () => {
    expect(
      check(moveRequest(order(), 'declined', text).checks, MARK_PAID),
    ).toBe(undefined);
    const paid = order({ status: 'ready', paymentState: 'paid' });
    expect(check(moveRequest(paid, 'completed', text).checks, MARK_PAID)).toBe(
      undefined,
    );
  });

  it('warns that ending a paid order refunds nothing', () => {
    const paid = order({ status: 'approved', paymentState: 'paid' });
    expect(moveRequest(paid, 'cancelled', text).warning).toBe(
      actions.confirm.warning,
    );
    expect(moveRequest(order(), 'declined', text).warning).toBe(undefined);
  });

  it('says whether the payment slip rides along when money becomes owed', () => {
    const invoiced = order({ paymentMethod: 'bank-transfer' });
    expect(
      check(moveRequest(invoiced, 'approved', text).checks, NOTIFY)?.hint,
    ).toContain(actions.notifyNoDocument);

    const withSlip = order({
      paymentMethod: 'bank-transfer',
      documents: [
        {
          kind: 'payment-instructions',
          source: 'supplied',
        } as AdminOrderDetail['documents'][number],
      ],
    });
    expect(
      check(moveRequest(withSlip, 'approved', text).checks, NOTIFY)?.hint,
    ).toContain(actions.notifyAttachment);
  });

  it('only mails where the move reaches their page', () => {
    const notify = check(moveRequest(order(), 'approved', text).checks, NOTIFY);
    expect(notify?.requires).toBe(SHOW_CUSTOMER);
  });
});

describe('moveOptions', () => {
  it('reads an untouched answer as shown, not mailed, not paid', () => {
    expect(moveOptions({ reason: '', checks: {} })).toEqual({
      showCustomer: true,
      notify: false,
      markPaid: false,
    });
  });
});
