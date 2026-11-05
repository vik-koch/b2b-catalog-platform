/**
 * What each reading of an automated catalog feed is called, and what it means.
 *
 * Import-free: the adapter builds its probes from these, and
 * `tools/generate-catalog-sync.mjs` renders the tables with them, without
 * pulling axios and Mailpit into a docs build.
 */
export const SYNC_PROBES = {
  run: {
    label: 'The run',
    meaning:
      'What became of the submission: `applied`, `waiting` for a person, `failed`, `no change` where the source and the catalog already agreed, or `discarded`/`superseded` for a staged run that was answered or overtaken.',
  },
  waiting: {
    label: 'Waiting for the admin',
    meaning:
      'How many runs the admin panel counts as awaiting review — the figure on its sync row, asked of the same endpoint the panel asks. Counted from where this journey started, so it is this feed’s contribution and not the deployment’s history.',
  },
  mail: {
    label: 'Mail to the shop',
    meaning:
      'What arrived for the people who run the shop at this step, named by the message it is. An empty cell means nothing was sent, and is asserted — which is most of what these journeys are about, because three of these four messages are sent on a change of state rather than on a run.',
  },
} as const satisfies Record<string, { label: string; meaning: string }>;
