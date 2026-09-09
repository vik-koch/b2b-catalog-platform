/**
 * What each reading is called in the documentation.
 *
 * Its own import-free module because two things need it and one of them runs
 * outside the test process: the adapter builds its probes from these labels,
 * and `tools/generate-order-lifecycle.mjs` renders the journey tables with
 * them. The generator must not have to import the adapter — that would pull
 * axios, Mailpit and the mounted mail wording into a documentation build.
 */
export const ORDER_PROBE_LABELS = {
  status: 'Where it stands',
  payment: 'What it owes',
  version: 'Version',
  customerSees: 'The version the customer is on',
  toldAbout: 'Already written to about',
  customerTotal: 'The total the customer reads',
  customerDocuments: 'What the customer can open',
  mail: 'Mail to the customer',
} as const satisfies Record<string, string>;
