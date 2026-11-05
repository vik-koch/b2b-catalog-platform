/**
 * The routes that receive a whole area at once: a catalogue (FR-ADM-07), a
 * customer book (FR-ADM-11), a batch of order instructions (FR-ADM-08). With
 * the global prefix, as a body parser mounts on a URL, and one per area, as
 * none sits under another. Failure routes carry a sentence, not megabytes.
 * Its own module, so a spec checks it without booting the app.
 */
export const MACHINE_SYNC_RUNS_PATHS = [
  '/api/machine/sync/runs',
  '/api/machine/sync/customers/runs',
  '/api/machine/sync/orders/runs',
];
