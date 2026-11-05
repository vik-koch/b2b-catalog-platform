/** An order as the order read reports it (docs/order-machine-api.md §2). */
export interface Order {
  readonly reference: string;
  readonly status: string;
  readonly paymentState: string;
  readonly revisionNumber: number;
  readonly statusChangedAt: string;
}

/** One write-back instruction (docs/order-machine-api.md §3.2). */
export interface Instruction {
  readonly reference: string;
  readonly basedOnRevision: number;
  readonly status?: string;
  readonly paid?: true;
  readonly notify: boolean;
  readonly showCustomer: boolean;
}

/** The back office's next step for an order in each open state. */
const NEXT: Record<string, string> = {
  requested: 'approved',
  approved: 'ready',
  ready: 'completed',
};

/** Slack on the wait: the platform stamps a step just after its cycle starts,
 * so an order stepped at 08:00 is milliseconds short at 09:00. */
const SLACK_MS = 5 * 60_000;

/**
 * One step for each open order that stood `stepAfterHours`: accepted, ready,
 * handed over, each told to the customer. Handing over records the payment,
 * and an earlier handover still owed is settled silently, without a version.
 *
 * Read off the order as it stands, so a repeat or restart takes no step twice:
 * a step moves `statusChangedAt`. Called-off and refused orders are left
 * alone.
 */
export function stepsFor(
  orders: readonly Order[],
  now: Date,
  stepAfterHours: number,
): Instruction[] {
  const ripe = now.getTime() - stepAfterHours * 3_600_000 + SLACK_MS;
  return orders.flatMap((order): Instruction[] => {
    const next = NEXT[order.status];
    if (next) {
      if (Date.parse(order.statusChangedAt) > ripe) return [];
      return [
        {
          reference: order.reference,
          basedOnRevision: order.revisionNumber,
          status: next,
          ...(next === 'completed' && order.paymentState !== 'paid'
            ? { paid: true as const }
            : {}),
          notify: true,
          showCustomer: true,
        },
      ];
    }
    if (order.status === 'completed' && order.paymentState !== 'paid') {
      return [
        {
          reference: order.reference,
          basedOnRevision: order.revisionNumber,
          paid: true,
          notify: false,
          showCustomer: false,
        },
      ];
    }
    return [];
  });
}
