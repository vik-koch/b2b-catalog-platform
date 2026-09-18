import type { Journey } from '../support/journey/journey';

/**
 * What the order exchange does to an order, as data.
 *
 * Read twice, like the catalog, customer, order and account ones:
 * `order-sync-journeys.spec.ts` walks them against the running API, and
 * `tools/generate-order-sync.mjs` renders them into `docs/order-sync.md`.
 *
 * They exist for what a single instruction cannot show. **One exchange writes
 * at most one version** (ADR 0062) is a claim about a sequence: it is only
 * worth anything if four exchanges leave four versions, a re-send leaves none,
 * and the money recorded in the same breath as a move leaves none of its own.
 * The same goes for the two facts a source has to live with — that the
 * customer can call an order off underneath it, and that an instruction
 * answering a version the order has moved past is refused rather than applied
 * to something else.
 *
 * Every one of them runs with order processing **handed over** (FR-ADM-10):
 * nothing in the admin panel could have produced any of this.
 */

export interface OrderSyncJourney extends Journey {
  /** Nothing yet, and deliberately: every journey starts from the same kind of
   * order — one placed at the checkout, which is where all of them come from
   * however the area is owned. */
  readonly exchange?: Record<string, never>;
}

export const orderSyncJourneys: readonly OrderSyncJourney[] = [
  {
    slug: 'worked-in-the-other-system',
    title: 'An order worked entirely in the other system',
    note: 'The ordinary case, end to end, with nobody here touching it. What it is really about is the invoice: the shop’s own paperwork arrives as bytes before the version that announces it, so one message carries both — and until the order owes money, the customer is not offered it at all.',
    given:
      'A signed-in customer’s order, for delivery and invoiced to their company, placed while the back office owns order processing.',
    start: {
      status: 'requested',
      payment: 'not-due',
      version: 1,
      customerSees: 1,
      readsOut: 'requested @ 1',
      customerDocuments: ['order-summary'],
    },
    steps: [
      {
        what: 'The source polls for orders and finds this one.',
        actor: 'system',
        action: 'read',
        // A read changes nothing and is never gated on ownership — it is how
        // the source learns the version its instruction has to answer.
      },
      {
        what: 'The back office prints the invoice and posts it as a file.',
        actor: 'system',
        action: 'supplyDocument',
        args: { kind: 'payment-instructions', notify: false },
        // Nothing moves: a document writes no version and files no run. The
        // customer is not offered it either, because an order nobody has
        // answered yet owes nothing.
      },
      {
        what: 'It accepts the order and says so.',
        actor: 'system',
        action: 'writeBack',
        args: { status: 'approved', notify: true, showCustomer: true },
        // The one message carries the file that was filed a moment ago, which
        // is the whole reason for that ordering.
        expect: {
          run: ['applied'],
          instruction: ['transition'],
          status: 'approved',
          payment: 'awaiting',
          version: 2,
          customerSees: 2,
          readsOut: 'approved @ 2',
          customerDocuments: ['order-summary', 'payment-instructions'],
          customerMail: ['approved+attached'],
        },
      },
      {
        what: 'The transfer arrives and the back office records it.',
        actor: 'system',
        action: 'writeBack',
        args: { paid: true, notify: false, showCustomer: true },
        // The reading this journey exists to pin down: money on its own is not
        // a version. Nothing to tell the customer either — they know what they
        // sent.
        expect: {
          run: ['applied'],
          instruction: ['payment'],
          payment: 'paid',
        },
      },
      {
        what: 'It is packed over there, and the order is marked ready.',
        actor: 'system',
        action: 'writeBack',
        args: { status: 'ready', notify: true, showCustomer: true },
        expect: {
          run: ['applied'],
          instruction: ['transition'],
          status: 'ready',
          version: 3,
          customerSees: 3,
          readsOut: 'ready @ 3',
          customerMail: ['readyDelivery'],
        },
      },
      {
        what: 'It is delivered, and the order is completed.',
        actor: 'system',
        action: 'writeBack',
        args: { status: 'completed', notify: true, showCustomer: true },
        expect: {
          run: ['applied'],
          instruction: ['transition'],
          status: 'completed',
          version: 4,
          customerSees: 4,
          readsOut: 'completed @ 4',
          customerMail: ['completed'],
        },
      },
    ],
  },
  {
    slug: 'one-exchange-one-version',
    title: 'Moved, re-priced and paid in one exchange',
    note: 'The rule the area is built on (ADR 0062). An order that was agreed on the phone, accepted and paid between two polls is one event to the customer — one version, one message — and not three. The re-send after it is the other half: a polling source that cannot remember what it sent writes nothing at all.',
    given:
      'The same kind of order, and a source that has already read it once.',
    from: [
      {
        what: 'The source reads the order.',
        actor: 'system',
        action: 'read',
      },
    ],
    start: { status: 'requested', version: 1, customerSees: 1 },
    steps: [
      {
        what: 'Half the quantity is agreed on the phone; the back office accepts the order at the new figure and records the transfer that arrived with it.',
        actor: 'system',
        action: 'writeBack',
        args: {
          status: 'approved',
          pieces: 10,
          paid: true,
          note: 'Half now, half in March — agreed by phone.',
          notify: true,
          showCustomer: true,
        },
        // Three things the admin panel would do with three buttons, filed as
        // one version — as the change, because that is the part a reader
        // cannot work out from the status column.
        expect: {
          run: ['applied'],
          instruction: ['adjustment'],
          status: 'approved',
          payment: 'paid',
          version: 2,
          customerSees: 2,
          readsOut: 'approved @ 2',
          customerMail: ['changed'],
        },
      },
      {
        what: 'The next poll cycle sends the very same instruction again.',
        actor: 'system',
        action: 'writeBack',
        args: {
          status: 'approved',
          pieces: 10,
          paid: true,
          note: 'Half now, half in March — agreed by phone.',
          notify: true,
          showCustomer: true,
        },
        // Reported, never refused (FR-ADM-16): a re-send is the normal
        // behaviour of a source that cannot remember what it sent, and `notify`
        // does not make a message out of nothing.
        expect: { run: ['no change'], instruction: ['unchanged'] },
      },
      {
        what: 'A second exchange, prepared before the first one landed, answers the version the order used to stand at.',
        actor: 'system',
        action: 'writeBack',
        args: { basedOn: 1, status: 'ready', notify: true, showCustomer: true },
        // Refused with what it is, rather than applied to an order that has
        // moved since the instruction was decided.
        expect: {
          run: ['applied'],
          instruction: ['refused: order-changed'],
        },
      },
      {
        what: 'It re-reads the order and answers the version it now stands at.',
        actor: 'system',
        action: 'read',
      },
      {
        what: 'And marks it ready.',
        actor: 'system',
        action: 'writeBack',
        args: { status: 'ready', notify: true, showCustomer: true },
        expect: {
          run: ['applied'],
          instruction: ['transition'],
          status: 'ready',
          version: 3,
          customerSees: 3,
          readsOut: 'ready @ 3',
          customerMail: ['readyDelivery'],
        },
      },
    ],
  },
  {
    slug: 'called-off-underneath-the-exchange',
    title: 'Called off while the other system was working it',
    note: 'The one move a customer keeps however the area is owned (FR-ADM-10), and the one an exchange must never drive over the top of. A cancellation is not a conflict for the source to resolve — it is a fact it has to read.',
    given: 'The same kind of order, read once by the source.',
    from: [
      {
        what: 'The source reads the order.',
        actor: 'system',
        action: 'read',
      },
    ],
    start: { status: 'requested', version: 1, readsOut: 'requested @ 1' },
    steps: [
      {
        what: 'The customer calls the order off, saying why.',
        actor: 'customer',
        action: 'cancelAsCustomer',
        args: { reason: 'Ordered twice by mistake.' },
        // Nothing is written to them about something they just did, and the
        // exchange is told nothing — it finds out by looking.
        expect: {
          status: 'cancelled',
          version: 2,
          customerSees: 2,
          readsOut: 'cancelled @ 2',
        },
      },
      {
        what: 'The back office, which read it before that, accepts the order.',
        actor: 'system',
        action: 'writeBack',
        args: { basedOn: 1, status: 'approved', notify: true },
        // The version check catches it first, and says what the order now
        // stands at rather than what it stands as.
        expect: {
          run: ['applied'],
          instruction: ['refused: order-changed'],
        },
      },
      {
        what: 'It re-reads the order.',
        actor: 'system',
        action: 'read',
      },
      {
        what: 'And, still holding a picking list for it, tries again.',
        actor: 'system',
        action: 'writeBack',
        args: { status: 'approved', notify: true },
        // Now the refusal it is actually about. The alternative — walking the
        // order forward over the cancellation — is a customer who called an
        // order off and watched it ship.
        expect: {
          run: ['applied'],
          instruction: ['refused: order-called-off'],
        },
      },
    ],
  },
  {
    slug: 'refused-over-the-exchange',
    title: 'An order the other system cannot fill',
    note: 'The refusals that are about the order rather than about the exchange: a move that owes the customer an answer and was sent without one, and money recorded against an order that ended. Each of them skips its own instruction and no more — a batch that refused three orders and wrote forty is a run that wrote forty.',
    given: 'The same kind of order, read once by the source.',
    from: [
      {
        what: 'The source reads the order.',
        actor: 'system',
        action: 'read',
      },
    ],
    start: { status: 'requested', version: 1 },
    steps: [
      {
        what: 'The back office declines the order, saying nothing about why.',
        actor: 'system',
        action: 'writeBack',
        args: { status: 'declined', notify: true, showCustomer: true },
        // The two statuses that end an order owe the customer a sentence, and
        // an exchange is held to it exactly as a manager is.
        expect: {
          run: ['applied'],
          instruction: ['refused: reason-required'],
        },
      },
      {
        what: 'It sends the same instruction with the reason on it.',
        actor: 'system',
        action: 'writeBack',
        args: {
          status: 'declined',
          reason: 'Out of stock until March.',
          notify: true,
          showCustomer: true,
        },
        expect: {
          run: ['applied'],
          instruction: ['transition'],
          status: 'declined',
          version: 2,
          customerSees: 2,
          readsOut: 'declined @ 2',
          customerMail: ['declined'],
        },
      },
      {
        what: 'A stray instruction records a payment against it anyway.',
        actor: 'system',
        action: 'writeBack',
        args: { paid: true, notify: false },
        // Nothing is owed on an order nobody is filling, so nothing can be
        // recorded against it — the same refusal a manager's tick meets.
        expect: {
          run: ['applied'],
          instruction: ['refused: payment-not-recordable'],
        },
      },
    ],
  },
  {
    slug: 'an-exchange-that-breaks-and-comes-back',
    title: 'An exchange that breaks, stays broken, and comes back',
    note: 'What the shop is told about the connection itself (FR-NOTIF-09), and what it is deliberately not told twice. An order exchange has two of these messages and not four: nothing it sends can wait for a decision, so there is nothing to announce and nothing to review.',
    given:
      'The same kind of order, and a source that reports its own breakage rather than going quiet.',
    from: [
      {
        what: 'The source reads the order.',
        actor: 'system',
        action: 'read',
      },
    ],
    start: { status: 'requested', version: 1 },
    steps: [
      {
        what: 'The nightly export breaks before it produces anything.',
        actor: 'system',
        action: 'reportFailure',
        args: { message: 'order export ended early: connection reset' },
        // A feed that has stopped is otherwise indistinguishable from one with
        // nothing to send, which is the whole reason this route exists.
        expect: { run: ['failed'], shopMail: ['orderSyncFailed'] },
      },
      {
        what: 'It breaks again twenty minutes later.',
        actor: 'system',
        action: 'reportFailure',
        args: { message: 'order export ended early: connection reset' },
        // Sent on a change of state: the shop has already been told, and being
        // told hourly is how a person learns to filter the message away.
        expect: { run: ['failed'] },
      },
      {
        what: 'The connection is fixed, and the back office accepts the order.',
        actor: 'system',
        action: 'writeBack',
        args: { status: 'approved', notify: true, showCustomer: true },
        expect: {
          run: ['applied'],
          instruction: ['transition'],
          status: 'approved',
          payment: 'awaiting',
          version: 2,
          customerSees: 2,
          readsOut: 'approved @ 2',
          customerMail: ['approved'],
          shopMail: ['orderSyncRecovered'],
        },
      },
    ],
  },
];
