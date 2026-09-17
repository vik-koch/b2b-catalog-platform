/**
 * What each reading of the customer exchange is called, and what it means.
 *
 * Its own import-free module, like the catalog and account ones: the adapter
 * builds its probes from these labels and `tools/generate-customer-sync.mjs`
 * renders the tables and the legend with them, and the generator must not have
 * to import the adapter — which would pull axios and Mailpit into a
 * documentation build.
 */
export const CUSTOMER_SYNC_PROBES = {
  run: {
    label: 'The run',
    meaning:
      'What became of the submission: `applied`, `waiting` for a person, `failed`, `no change` where the source and the accounts already agreed, or `discarded`/`superseded` for a staged run that was answered or overtaken.',
  },
  account: {
    label: 'The account',
    meaning:
      'Where the account this journey is about stands, as staff see it: `none` before anything asks for it, then `pending`, `invited`, `active` or `disabled`. The exchange never deletes, so `gone` is not a reading it can produce (FR-ADM-15).',
  },
  signsIn: {
    label: 'Can sign in',
    meaning:
      'Whether the person can actually get into the account with a password of their own, asked by signing in. It is the reading that separates an account the exchange *asked for* from one somebody can use: an invited account has no password anybody holds (FR-ADM-13), and only the link it was sent creates one.',
  },
  waiting: {
    label: 'Waiting for a manager',
    meaning:
      'How many customer runs the panel counts as awaiting review — the figure on its customers row, asked of the same endpoint the panel asks. Counted from where this journey started, so it is this exchange’s contribution and not the deployment’s history. Customer runs are a manager’s work as well as an admin’s (FR-ADM-09), which is why the count is its own and not the catalog’s.',
  },
  shopMail: {
    label: 'Mail to the shop',
    meaning:
      'What arrived for the people who run the shop at this step, named by the message it is. Worded about accounts rather than about the catalog, and sent on a change of state (FR-NOTIF-09) — so an empty cell is asserted, and is most of what these journeys are about.',
  },
  customerMail: {
    label: 'Mail to the customer',
    meaning:
      'What arrived in the account holder’s own inbox. The exchange issues no credential, so the one thing it can send somebody is a link to set a password of their own — and it is sent by this platform, never carried in from outside.',
  },
} as const satisfies Record<string, { label: string; meaning: string }>;
