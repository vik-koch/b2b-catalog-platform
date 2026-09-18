/**
 * The routes that receive a whole area in one request — a catalog
 * (FR-ADM-07), a customer book (FR-ADM-11) or a batch of order instructions
 * (FR-ADM-08).
 *
 * Written out with the global prefix, because a body parser is mounted on the
 * URL rather than on a Nest route. Every area is listed separately: express
 * matches a mount path as a prefix, and none of the three sits under another,
 * so a single entry would leave the other two on the 100 kB default. The
 * failure routes are deliberately left out — a sentence is not megabytes.
 *
 * Its own module so that a spec can check it against the contracts without
 * booting the application.
 */
export const MACHINE_SYNC_RUNS_PATHS = [
  '/api/machine/sync/runs',
  '/api/machine/sync/customers/runs',
  '/api/machine/sync/orders/runs',
];
