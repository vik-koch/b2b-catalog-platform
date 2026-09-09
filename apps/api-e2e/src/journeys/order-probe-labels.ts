/**
 * What each reading of an order is called, and what it means.
 *
 * Its own import-free module because two things need it and one of them runs
 * outside the test process: the adapter builds its probes from these labels,
 * and `tools/generate-order-lifecycle.mjs` renders the journey tables and their
 * legend with them. The generator must not have to import the adapter — that
 * would pull axios, Mailpit and the mounted mail wording into a documentation
 * build.
 *
 * The meanings are here rather than in the document because they describe what
 * the probe reads: a column nobody can explain in one sentence is a column that
 * should not be in the table.
 */
export const ORDER_PROBES = {
  status: {
    label: 'Where it stands',
    meaning: 'The order’s fulfilment state, as staff see it.',
  },
  payment: {
    label: 'What it owes',
    meaning:
      'The second axis: `not-due`, `awaiting` or `paid`. Independent of where the order stands.',
  },
  version: {
    label: 'Version',
    meaning:
      'How many versions the order has. Every move and every change writes one, so this counts what has happened to it.',
  },
  customerSees: {
    label: 'The version the customer is on',
    meaning:
      'Which of those versions their own page shows. It can lag the newest one: a change nobody has told them about is not theirs to see.',
  },
  toldAbout: {
    label: 'Already written to about',
    meaning:
      'The statuses the customer has had a mail about, listed alphabetically rather than in the order they were sent. This is what decides whether the next move offers its tick box already ticked — a state on this list is not news twice.',
  },
  reason: {
    label: 'The reason on it',
    meaning:
      'What the shop said when it refused the order, or the customer when they called it off. Cleared when an ended order is reopened.',
  },
  customerTotal: {
    label: 'The total the customer reads',
    meaning:
      'The money on the version they are on — not necessarily what the order now says.',
  },
  customerDocuments: {
    label: 'What the customer can open',
    meaning:
      'The documents readable from their own page, which depends on the version they are on and on what the order owes. A file the shop put there in place of the generated one is marked `supplied`, and one the order has since moved on from `outdated`.',
  },
  staffDocuments: {
    label: 'What the shop can open',
    meaning:
      'The same list from the admin side, which is not the same list: staff read whatever is filed, whenever it was filed, and see a supplied file marked `outdated` as soon as the order moves past the version it states.',
  },
  waitingOnCustomer: {
    label: 'Waiting for the customer',
    meaning:
      'How many of their orders their own panel is flagging — money owed, or a collection ready to be picked up. It is the marker they see on signing in. Blank for a guest, who has no panel and hears from the shop only by mail.',
  },
  mail: {
    label: 'Mail to the customer',
    meaning:
      'What arrived in their inbox at this step, named by the message it is. An empty cell means nothing was sent, and is asserted.',
  },
} as const satisfies Record<string, { label: string; meaning: string }>;
