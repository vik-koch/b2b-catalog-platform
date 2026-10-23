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

/** Slack on the wait. A cycle starts at the same second of each hour, and the
 * platform stamps a step a moment after its cycle started — without this, an
 * order stepped at 08:00 would be a few milliseconds short at 09:00 and wait
 * for 10:00. */
const SLACK_MS = 5 * 60_000;

/**
 * One step for every open order that has stood where it is for at least
 * `stepAfterHours`: accepted, then ready, then handed over — each told to the
 * customer, with their page moving on. Handing over records the payment too,
 * cash and invoice alike, and an order handed over earlier and still owed is
 * settled on its own; money is recorded without a version, so that one
 * notifies nobody.
 *
 * Everything is read off the order as it stands, so a cycle repeated or a
 * container restarted takes no step twice: the step moves `statusChangedAt`,
 * and the order then waits its hours again. An order the customer called off,
 * or one the shop refused, is left alone.
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
