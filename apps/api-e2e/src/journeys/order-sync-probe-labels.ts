/**
 * What each reading of the order exchange is called, and what it means.
 *
 * Its own import-free module, like the catalog, customer and account ones: the
 * adapter builds its probes from these labels and
 * `tools/generate-order-sync.mjs` renders the tables and the legend with them,
 * and the generator must not have to import the adapter — which would pull
 * axios and Mailpit into a documentation build.
 */
export const ORDER_SYNC_PROBES = {
  run: {
    label: 'The run',
    meaning:
      'What became of the batch as a whole: `applied` where it wrote something, `no change` where every instruction in it said what the orders already said, or `failed` where the source reported that it could not run. There is no `waiting` here — an order run is never staged (ADR 0062), so `discarded` and `superseded` cannot happen either.',
  },
  instruction: {
    label: 'What the instruction did',
    meaning:
      'The answer to this journey’s own order, from the batch’s reply: `transition` where only its status moved, `adjustment` where its content did, `payment` where neither did and the money was recorded, `unchanged` where it already said what it was told, or `refused: <code>` where the exchange could not answer it. One refusal never fails the batch, which is why it is a reading of the instruction rather than of the run.',
  },
  status: {
    label: 'The order',
    meaning:
      'Where the order stands, read from the admin panel — which stays readable while an external system owns the area (FR-ADM-10) even though every button on it is refused.',
  },
  payment: {
    label: 'Payment',
    meaning:
      'The second axis (FR-ORD-04): `not-due` while nobody has answered the order, `awaiting` once accepting it made the money owed, `paid` once it arrived. An exchange records it in the same breath as a move, and it is the one thing a write-back can say that writes no version at all.',
  },
  version: {
    label: 'Version',
    meaning:
      'Which version the order stands at (FR-ORD-03, ADR 0051). The reading the whole area turns on: **one exchange writes at most one version**, so an instruction that moved an order, re-priced it and recorded its money moves this by exactly one.',
  },
  customerSees: {
    label: 'The customer’s version',
    meaning:
      'Which version the customer’s own page is showing. It follows the newest one only where the instruction said `showCustomer` — the same decision a manager makes on every move (FR-NOTIF-03), which a polling exchange has to make too.',
  },
  readsOut: {
    label: 'What the source reads',
    meaning:
      'The order as `GET /machine/orders/{reference}` reports it — its status and the version a write-back must answer. Read through the credential rather than through a session, and never gated on ownership (FR-ADM-08): a source whose writes are being refused can still see what it is being refused about.',
  },
  customerDocuments: {
    label: 'The customer’s documents',
    meaning:
      'What the customer may open on the order (FR-ORD-05). A file supplied over the machine endpoint arrives as bytes and is offered to them only once their own view has reached the version it was filed against — which is why the adapter supplies it *before* the version that announces it.',
  },
  customerMail: {
    label: 'Mail to the customer',
    meaning:
      'What arrived in the customer’s inbox at this step, named by the message it is. An exchange answers the notify question per instruction, so an empty cell is asserted and is most of what these journeys are about.',
  },
  shopMail: {
    label: 'Mail to the shop',
    meaning:
      'What the people running the shop were told about the exchange itself (FR-NOTIF-09), sent on a change of state. Two messages only — it broke, it is working again — because an order run is never staged and so never waits for anybody’s decision.',
  },
} as const satisfies Record<string, { label: string; meaning: string }>;
