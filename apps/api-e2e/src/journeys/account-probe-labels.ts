/**
 * What each reading of an account is called, and what it means.
 *
 * Its own import-free module for the same reason the order one is: the adapter
 * builds its probes from these labels, and
 * `tools/generate-account-lifecycle.mjs` renders the journey tables and their
 * legend with them — and the generator must not have to import the adapter,
 * which would pull axios and Mailpit into a documentation build.
 */
export const ACCOUNT_PROBES = {
  status: {
    label: 'Where it stands',
    meaning:
      'The account’s status as staff see it: `pending`, `invited`, `active`, `disabled` or `anonymized`. `gone` where the row no longer exists at all, which only a declined registration does.',
  },
  role: {
    label: 'Role',
    meaning:
      'What the account may do — `user`, `manager` or `admin`. Authorization only: it is not the pricing group.',
  },
  tier: {
    label: 'Price group',
    meaning:
      'Which price list the account is read at, assigned on approval and invisible to its owner. `base` is the ordinary, permanent answer for a customer nobody put on a list.',
  },
  signsIn: {
    label: 'Can sign in',
    meaning:
      'Whether the password this journey uses actually opens the account, asked by signing in. It is the reading the status is supposed to imply, checked rather than assumed.',
  },
  waitingOnShop: {
    label: 'Waiting for the shop',
    meaning:
      'Whether the account is in the queue the staff panel counts and its marker links to — registrations nobody has decided on. 🟡 means the next move is the shop’s.',
  },
  mail: {
    label: 'Mail to the account holder',
    meaning:
      'What arrived in their inbox at this step, named by the message it is. An empty cell means nothing was sent, and is asserted — which is most of what these journeys are about.',
  },
} as const satisfies Record<string, { label: string; meaning: string }>;
