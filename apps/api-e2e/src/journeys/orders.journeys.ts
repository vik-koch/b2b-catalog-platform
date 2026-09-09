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
  {
    slug: 'collected-and-paid-in-cash',
    title: 'Collected from the counter, paid in cash',
    note: 'The other shape of an order: a guest with no account, collecting rather than receiving, paying at the handover. Cash is the case a single status chain could not describe.',
    given:
      'A guest’s order, to be collected from an office and paid for in cash.',
    order: { asGuest: true, paymentMethod: 'cash', fulfilment: 'pickup' },
    start: {
      status: 'requested',
      payment: 'not-due',
      version: 1,
      customerSees: 1,
      toldAbout: ['requested'],
    },
    steps: [
      {
        what: 'The manager accepts it.',
        actor: 'manager',
        action: 'move',
        args: { to: 'approved' },
        // Nothing becomes owed. Cash exists at the handover, so an accepted
        // cash order is not money the shop is waiting for.
        expect: {
          status: 'approved',
          version: 2,
          customerSees: 2,
          toldAbout: ['approved', 'requested'],
          mail: ['approved'],
        },
      },
      {
        what: 'It is packed, and waiting at the counter.',
        actor: 'manager',
        action: 'move',
        args: { to: 'ready' },
        // The same state as a delivery order reaches, worded for somebody who
        // has to come and get it.
        expect: {
          status: 'ready',
          version: 3,
          customerSees: 3,
          toldAbout: ['approved', 'ready', 'requested'],
          mail: ['readyPickup'],
        },
      },
      {
        what: 'The customer collects it and pays, which the manager records with the handover.',
        actor: 'manager',
        action: 'move',
        args: { to: 'completed', markPaid: true },
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
    slug: 'changed-after-it-was-accepted',
    title: 'Changed after it was accepted',
    note: 'An order and the customer’s copy of it are two positions, and a change moves only one of them. Nothing reaches the customer until somebody says it should.',
    given: 'A signed-in customer’s order, already accepted.',
    order: { paymentMethod: 'bank-transfer', fulfilment: 'delivery' },
    from: [
      {
        what: 'The manager accepts it.',
        actor: 'manager',
        action: 'move',
        args: { to: 'approved' },
      },
    ],
    start: {
      status: 'approved',
      payment: 'awaiting',
      version: 2,
      customerSees: 2,
    },
    steps: [
      {
        what: 'Short of stock, the shop agrees a smaller quantity on the phone and writes it down.',
        actor: 'manager',
        action: 'adjust',
        // One basis unit — the line was priced per ten pieces and bought as
        // two of them.
        args: { units: 1, note: 'Only ten left — agreed on the phone.' },
        // A new version, and the order stands exactly where it stood. Their
        // page does not follow: a change nobody has told them about is not
        // theirs to see, and the total they hold is still the old one.
        expect: { version: 3 },
      },
      {
        what: 'The manager confirms the change in writing.',
        actor: 'manager',
        action: 'tellCustomer',
        args: { notify: true },
        expect: { customerSees: 3, customerTotal: 1999, mail: ['changed'] },
      },
      {
        what: 'The smaller order is packed and marked ready.',
        actor: 'manager',
        action: 'move',
        args: { to: 'ready' },
        expect: {
          status: 'ready',
          version: 4,
          customerSees: 4,
          toldAbout: ['approved', 'ready', 'requested'],
          mail: ['readyDelivery'],
        },
      },
    ],
  },
  {
    slug: 'refused-then-answered-again',
    title: 'Refused, then answered again',
    note: 'A refusal is quoted at the customer and keeps the order. Reopening it is staff putting their own record right, which is why it is quiet unless somebody says otherwise.',
    given: 'A signed-in customer’s order the shop cannot fill.',
    order: { paymentMethod: 'bank-transfer', fulfilment: 'delivery' },
    start: { status: 'requested', reason: null, version: 1 },
    steps: [
      {
        what: 'The manager declines it, saying why.',
        actor: 'manager',
        action: 'move',
        args: { to: 'declined', reason: 'Out of stock until October.' },
        // The order is kept, not deleted, and the reason is on it — the
        // customer reads it on their own page as well as in the mail.
        expect: {
          status: 'declined',
          reason: 'Out of stock until October.',
          version: 2,
          customerSees: 2,
          toldAbout: ['declined', 'requested'],
          mail: ['declined'],
        },
      },
      {
        what: 'The stock arrives sooner than expected, so the manager reopens it.',
        actor: 'manager',
        action: 'move',
        args: { to: 'requested' },
        // Back to the start, with the refusal cleared off it. Their page
        // follows, as it does for every move on a running order — but no mail:
        // `requested` is a state they were written to about when the order
        // arrived, so the offer arrives unticked and this step takes it.
        expect: {
          status: 'requested',
          reason: null,
          version: 3,
          customerSees: 3,
        },
      },
      {
        what: 'The manager accepts it, and this time says so deliberately.',
        actor: 'manager',
        action: 'move',
        args: { to: 'approved', notify: true },
        // The tick box would have arrived cleared — they have had an
        // `approved` mail about nothing, but the list is what it is — so this
        // is a manager overriding the default on purpose.
        expect: {
          status: 'approved',
          payment: 'awaiting',
          version: 4,
          customerSees: 4,
          toldAbout: ['approved', 'declined', 'requested'],
          mail: ['approved'],
        },
      },
    ],
  },
  {
    slug: 'called-off-by-the-customer',
    title: 'Called off by the customer',
    note: 'The one move a customer has, and the one thing the shop must not do about it: write to them about something they just did themselves.',
    given: 'A signed-in customer’s order, still waiting for an answer.',
    order: { paymentMethod: 'bank-transfer', fulfilment: 'delivery' },
    start: { status: 'requested', payment: 'not-due', version: 1 },
    steps: [
      {
        what: 'The customer calls the order off, saying why.',
        actor: 'customer',
        action: 'cancelAsCustomer',
        args: { reason: 'Ordered twice by mistake.' },
        // A reason is asked of them and not required: the shop may already be
        // packing it. The order is kept either way.
        expect: {
          status: 'cancelled',
          reason: 'Ordered twice by mistake.',
          version: 2,
          customerSees: 2,
        },
      },
    ],
  },
  {
    slug: 'the-slip-the-shop-owes',
    title: 'The payment slip, and who may open it',
    note: 'A document is filed against a version. Until the customer’s own page reaches that version they are not offered it — which is the rule that stops a file describing a change nobody has told them about.',
    given: 'A signed-in customer’s order, invoiced and already accepted.',
    order: { paymentMethod: 'bank-transfer', fulfilment: 'delivery' },
    from: [
      {
        what: 'The manager accepts it.',
        actor: 'manager',
        action: 'move',
        args: { to: 'approved' },
      },
    ],
    start: {
      status: 'approved',
      payment: 'awaiting',
      version: 2,
      customerSees: 2,
      customerDocuments: ['order-summary'],
    },
    steps: [
      {
        what: 'A line is repriced, and the customer is not told yet.',
        actor: 'manager',
        action: 'adjust',
        args: { units: 1, note: 'Halved, against the list the shop agreed.' },
        expect: { version: 3 },
      },
      {
        what: 'The shop files the payment instructions for the order as it now stands.',
        actor: 'manager',
        action: 'supplyDocument',
        args: { kind: 'payment-instructions' },
        // Filed against version 3, and the customer is on 2 — so it is the
        // shop's to read and not yet theirs.
        expect: {},
      },
      {
        what: 'The manager confirms the change, which brings the slip with it.',
        actor: 'manager',
        action: 'tellCustomer',
        args: { notify: true },
        expect: {
          customerSees: 3,
          customerTotal: 1999,
          customerDocuments: ['order-summary', 'payment-instructions'],
          mail: ['changed'],
        },
      },
    ],
  },
  {
    slug: 'corrected-after-it-was-finished',
    title: 'Corrected after it was finished',
    note: 'What the platform records is what the shop did — including a correction to an order that ended weeks ago. Correcting one must not reopen it, and must not announce a lap of the workflow nobody took.',
    given: 'A signed-in customer’s order, delivered and completed.',
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
      {
        what: 'The manager completes it.',
        actor: 'manager',
        action: 'move',
        args: { to: 'completed' },
      },
    ],
    start: {
      status: 'completed',
      version: 4,
      customerSees: 4,
      toldAbout: ['approved', 'completed', 'ready', 'requested'],
    },
    steps: [
      {
        what: 'A wrong contact name is noticed on the finished order, and put right.',
        actor: 'manager',
        action: 'adjust',
        args: { contactName: 'Ada King', note: 'Corrected the contact name.' },
        // A change is not a move: the order stays completed, and an ended
        // order's versions no longer follow the customer on their own.
        expect: { version: 5 },
      },
      {
        what: 'The manager decides this one is worth telling them about.',
        actor: 'manager',
        action: 'tellCustomer',
        args: { notify: true },
        expect: { customerSees: 5, mail: ['changed'] },
      },
    ],
  },
];
