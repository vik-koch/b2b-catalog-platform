import type { Journey } from '../support/journey/journey';

/**
 * What an automated catalog feed puts in front of the shop, as data.
 *
 * Read twice, like the order and account ones: `sync-journeys.spec.ts` walks
 * them against the running API, and `tools/generate-catalog-sync.mjs` renders
 * them into `docs/catalog-sync.md`.
 *
 * They exist for the silences. Three of the four messages a feed sends are
 * sent on a **change of state** — the first failure after things were working,
 * the recovery, the moment something starts waiting for a person — and a claim
 * like "the second failure is silent" cannot be made about one run. Every step
 * here that says nothing about mail is asserting that none was sent, which is
 * most of the steps and the whole point.
 */

export interface SyncJourney extends Journey {
  /** Nothing yet, and deliberately: a sync journey starts from a feed that has
   * not run, which is the same starting point every time. */
  readonly feed?: Record<string, never>;
}

export const syncJourneys: readonly SyncJourney[] = [
  {
    slug: 'feed-breaks-and-recovers',
    title: 'A feed that breaks, stays broken, and comes back',
    note: 'The case a notification gets wrong by repeating itself: a feed on a twenty-minute cadence that stops working at midnight would write the same mail until somebody read one. It is announced once and answered once.',
    given: 'A feed nobody has heard from yet.',
    start: { run: 'none', waiting: 0 },
    steps: [
      {
        what: 'The source sends an ordinary export.',
        actor: 'system',
        action: 'submit',
        // Within the deployment's policy, so it applies itself and asks
        // nothing of anybody. The products it creates are its own news, below.
        expect: { run: 'applied', mail: ['syncCreated'] },
      },
      {
        what: 'The next run breaks.',
        actor: 'system',
        action: 'reportFailure',
        expect: { run: 'failed', mail: ['syncFailed'] },
      },
      {
        what: 'It breaks again twenty minutes later.',
        actor: 'system',
        action: 'reportFailure',
        // Nothing. The feed's state has not changed, and the shop has already
        // been told where it stands.
      },
      {
        what: 'And again.',
        actor: 'system',
        action: 'reportFailure',
      },
      {
        what: 'The source is fixed and delivers.',
        actor: 'system',
        action: 'submit',
        // The same rows as the first export: nothing to create, nothing to
        // change, so the catalog reads `no change` — and the recovery is still
        // announced, because what recovered is the connection, not the data.
        expect: { run: 'no change', mail: ['syncRecovered'] },
      },
    ],
  },
  {
    slug: 'run-waits-for-a-person',
    title: 'A run that waits, is overtaken, and is answered',
    note: 'One thing waiting is one thing waiting however many runs produce it. The count on the admin panel is the durable half of this — it does not depend on a message arriving — and it falls on its own when the run is answered.',
    given: 'A feed that has delivered normally.',
    from: [
      {
        what: 'An ordinary export lands.',
        actor: 'system',
        action: 'submit',
        args: { from: 1, count: 2 },
      },
    ],
    start: { run: 'applied', waiting: 0 },
    steps: [
      {
        what: 'The source sends an export it cannot fully vouch for.',
        actor: 'system',
        action: 'submit',
        args: { from: 3, count: 2, requestReview: true },
        expect: { run: 'waiting', waiting: 1, mail: ['syncWaiting'] },
      },
      {
        what: 'It sends another one twenty minutes later.',
        actor: 'system',
        action: 'submit',
        args: { from: 3, count: 3, requestReview: true },
        // The newer run replaces the older one rather than queueing behind it,
        // so there is still one decision to take and nothing new to say.
        expect: { waiting: 1 },
      },
      {
        what: 'The admin discards it.',
        actor: 'admin',
        action: 'discard',
        // The queue clears because the work was done, not because anybody
        // dismissed a notice — and a decision the admin took needs no mail
        // telling them they took it.
        expect: { run: 'discarded', waiting: 0 },
      },
      {
        what: 'The source sends a doubtful export again.',
        actor: 'system',
        action: 'submit',
        args: { from: 6, count: 2, requestReview: true },
        // News again: the last one was answered, so this is a fresh decision
        // rather than the same one restated.
        expect: { run: 'waiting', waiting: 1, mail: ['syncWaiting'] },
      },
      {
        what: 'The admin applies it.',
        actor: 'admin',
        action: 'apply',
        // Silent, though it creates products: the admin has just read the
        // preview that says which. The mail exists for what arrives while
        // nobody is looking.
        expect: { run: 'applied', waiting: 0 },
      },
    ],
  },
  {
    slug: 'products-arrive-overnight',
    title: 'New products arrive overnight',
    note: 'The one message that is not a transition. A product the source creates is off the storefront until somebody writes its page, and nothing else tells the admin that work arrived while they were asleep.',
    given: 'A feed that has delivered normally.',
    from: [
      {
        what: 'An ordinary export lands.',
        actor: 'system',
        action: 'submit',
        args: { from: 1, count: 2 },
      },
    ],
    start: { run: 'applied', waiting: 0 },
    steps: [
      {
        what: 'The nightly export carries products the shop has never seen.',
        actor: 'system',
        action: 'submit',
        args: { from: 3, count: 4 },
        expect: { run: 'applied', mail: ['syncCreated'] },
      },
      {
        what: 'The next run reprices them.',
        actor: 'system',
        action: 'submit',
        args: { from: 3, count: 4, price: 1500 },
        // A price move is what this feed is for. It is on the run log and on
        // the panel's last-sync line, and it is not mail.
        expect: { run: 'applied' },
      },
      {
        what: 'The one after that carries the same prices again.',
        actor: 'system',
        action: 'submit',
        args: { from: 3, count: 4, price: 1500 },
        // The source and the catalog agree, so there is nothing to apply and
        // nothing to decide — and a run with nothing in it is never work.
        expect: { run: 'no change' },
      },
    ],
  },
];
