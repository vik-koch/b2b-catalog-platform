import type { Journey } from '../support/journey/journey';

/**
 * The journeys an order can take, as data.
 *
 * Read twice: `order-journeys.spec.ts` walks them against the running API, and
 * `tools/generate-order-journeys.mjs` renders them into
 * `docs/order-lifecycle.md`. So the documentation states what is checked, and
 * every check is documented — the two cannot drift because there is only one
 * of them.
 *
 * Each journey covers accumulated state no other one reaches. They are
 * deliberately not a walk of every path: the per-move rules are covered
 * exhaustively in `orders.spec.ts`, and repeating them here would buy nothing
 * but round trips.
 */

export interface OrderJourney extends Journey {
  /** How the order this journey walks was placed. */
  readonly order: {
    /** A guest has no account page, and reads the order through its token. */
    readonly asGuest?: boolean;
    readonly paymentMethod?: 'cash' | 'bank-transfer';
    readonly fulfilment?: 'delivery' | 'pickup';
  };
}

export const orderJourneys: readonly OrderJourney[] = [
  {
    slug: 'delivered-and-paid',
    title: 'Delivered, invoiced, and paid on the doorstep',
    note: 'The whole forward chain for a signed-in customer, and the one journey that walks it end to end. Everything else starts partway along.',
    given:
      'A signed-in customer’s order, for delivery and invoiced to their company.',
    order: { paymentMethod: 'bank-transfer', fulfilment: 'delivery' },
    start: {
      status: 'requested',
      payment: 'not-due',
      version: 1,
      customerSees: 1,
      toldAbout: ['requested'],
    },
    steps: [
      {
        what: 'The manager checks the stock and accepts the order.',
        actor: 'manager',
        action: 'move',
        args: { to: 'approved' },
        // Accepting an invoiced order is the moment the money becomes owed —
        // the second axis moving without anybody touching it.
        expect: {
          status: 'approved',
          payment: 'awaiting',
          version: 2,
          customerSees: 2,
          toldAbout: ['approved', 'requested'],
          mail: ['approved'],
        },
      },
      {
        what: 'The order is packed, and the manager marks it ready.',
        actor: 'manager',
        action: 'move',
        args: { to: 'ready' },
        // A delivery order and a collection order are the same state read two
        // ways, and this is the half that says where it is going.
        expect: {
          status: 'ready',
          version: 3,
          customerSees: 3,
          toldAbout: ['approved', 'ready', 'requested'],
          mail: ['readyDelivery'],
        },
      },
      {
        what: 'It is handed over and paid for, which the manager records with the same click.',
        actor: 'manager',
        action: 'move',
        args: { to: 'completed', markPaid: true },
        // Money handed over with the goods is one event, not two.
        expect: {
          status: 'completed',
          payment: 'paid',
          version: 4,
          customerSees: 4,
          toldAbout: ['approved', 'completed', 'ready', 'requested'],
          mail: ['completed'],
        },
      },
    ],
  },
  {
    slug: 'undo-and-forward',
    title: 'A step taken back, and taken again',
    note: 'What the customer is *not* told. Walking a move back and repeating it must not write to them twice about a step they have already had — and must not make the genuinely new one quiet.',
    given:
      'The same order, already packed: accepted and marked ready, both announced.',
    order: { paymentMethod: 'bank-transfer', fulfilment: 'delivery' },
    from: [
      {
        what: 'The manager accepts it.',
        actor: 'manager',
        action: 'move',
        args: { to: 'approved' },
      },
      {
        what: 'The manager marks it ready.',
        actor: 'manager',
        action: 'move',
        args: { to: 'ready' },
      },
    ],
    start: {
      status: 'ready',
      version: 3,
      customerSees: 3,
      toldAbout: ['approved', 'ready', 'requested'],
    },
    steps: [
      {
        what: '`ready` was clicked too early, so the manager walks it back a step.',
        actor: 'manager',
        action: 'move',
        args: { to: 'approved' },
        // A version, and the customer's page follows it — but no mail. The
        // shop correcting itself is not news, so the offer arrives unticked
        // and this step takes it as offered.
        expect: { status: 'approved', version: 4, customerSees: 4 },
      },
      {
        what: 'The order is genuinely ready, and the manager says so again.',
        actor: 'manager',
        action: 'move',
        args: { to: 'ready' },
        // The move the customer has already had a mail about: forward, and
        // still quiet, because `ready` is already on the list above.
        expect: { status: 'ready', version: 5, customerSees: 5 },
      },
      {
        what: 'It is handed over and completed.',
        actor: 'manager',
        action: 'move',
        args: { to: 'completed' },
        // The lap around the workflow leaves no trace in the inbox, and the
        // one step they have not heard about is still announced.
        expect: {
          status: 'completed',
          version: 6,
          customerSees: 6,
          toldAbout: ['approved', 'completed', 'ready', 'requested'],
          mail: ['completed'],
        },
      },
    ],
  },
];
