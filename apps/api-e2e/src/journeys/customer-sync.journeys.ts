import type { Journey } from '../support/journey/journey';

/**
 * What the customer exchange does to an account, as data: walked by
 * `customer-sync-journeys.spec.ts`, rendered by
 * `tools/generate-customer-sync.mjs`. For the shop's silences, sent on a
 * change of state, and the gap between existing and usable: no credential
 * issued (FR-ADM-13), which only a sign-in shows.
 */

export interface CustomerSyncJourney extends Journey {
  /** Nothing yet, and deliberately: a customer journey starts from an account
   * that does not exist, which is the same starting point every time. */
  readonly exchange?: Record<string, never>;
}

export const customerSyncJourneys: readonly CustomerSyncJourney[] = [
  {
    slug: 'an-account-arrives',
    title: 'An account the source system asks for',
    note: 'The case that separates an account existing from an account somebody can use. The exchange creates it and sends nothing anybody can sign in with — what reaches the customer is this platform’s own link, and until they follow it the account is theirs in name only.',
    given:
      'A customer the shop deals with in its own system, and no account here.',
    start: { run: 'none', account: 'none', signsIn: 'no', waiting: 0 },
    steps: [
      {
        what: 'The source sends the customer for the first time.',
        actor: 'system',
        action: 'submit',
        // Within the deployment's policy, so it applies itself. The account
        // exists, and the one message that goes out goes to its owner.
        expect: {
          run: 'applied',
          account: 'invited',
          customerMail: ['invitationCreated'],
        },
      },
      {
        what: 'The customer follows the link and sets a password.',
        actor: 'customer',
        action: 'setPassword',
        expect: { account: 'active', signsIn: 'yes' },
      },
      {
        what: 'The source moves them onto another price list.',
        actor: 'system',
        action: 'submit',
        args: { tier: true },
        // An ordinary edit: it applies itself, tells nobody, and the pricing
        // group is not something the account holder is shown.
        expect: { run: 'applied' },
      },
      {
        what: 'The source sends the same thing again.',
        actor: 'system',
        action: 'submit',
        args: { tier: true },
        expect: { run: 'no change' },
      },
    ],
  },
  {
    slug: 'access-withdrawn-and-restored',
    title: 'An account that loses its access, and gets it back',
    note: 'Taking access away is the one move the exchange makes that a person has to agree to: it is staged, it is a manager’s to answer as well as an admin’s, and nothing happens to the account while it waits. Reinstatement is an ordinary run — putting somebody back is not a decision anybody needs protecting from.',
    given: 'A customer with an account they use.',
    from: [
      {
        what: 'The source sends the customer.',
        actor: 'system',
        action: 'submit',
      },
      {
        what: 'They set a password from the link.',
        actor: 'customer',
        action: 'setPassword',
      },
    ],
    start: { account: 'active', signsIn: 'yes', waiting: 0 },
    steps: [
      {
        what: 'The source says the customer is no longer trading with the shop.',
        actor: 'system',
        action: 'submit',
        args: { access: 'disabled' },
        // Staged by the policy, and announced once. The account is untouched:
        // a staged run is a description, not a write.
        expect: {
          run: 'waiting',
          waiting: 1,
          shopMail: ['customerSyncWaiting'],
        },
      },
      {
        what: 'The source repeats it before anybody has answered.',
        actor: 'system',
        action: 'submit',
        args: { access: 'disabled' },
        // The newer run replaces the older: one thing waiting, nothing said
        // again.
        expect: { run: 'waiting', waiting: 1 },
      },
      {
        what: 'A manager reads it and applies it.',
        actor: 'manager',
        action: 'apply',
        expect: {
          run: 'applied',
          account: 'disabled',
          signsIn: 'no',
          waiting: 0,
        },
      },
      {
        what: 'The customer starts trading again and the source says so.',
        actor: 'system',
        action: 'submit',
        args: { access: 'enabled' },
        // Their own password still works: switching an account off never took
        // it away, which is why coming back needs no new link.
        expect: { run: 'applied', account: 'active', signsIn: 'yes' },
      },
    ],
  },
  {
    slug: 'claiming-a-registration',
    title: 'An account somebody registered here',
    note: 'The deadlock the exchange would otherwise sit in. An account registered on the website carries no source key, so no row can match it — and while customer accounts are handed over, staff cannot approve it either. A run has to ask for it by address, once, and a person has to agree.',
    given:
      'Somebody who registered on the website and is waiting to be approved.',
    from: [
      {
        what: 'They register on the website.',
        actor: 'customer',
        action: 'register',
      },
    ],
    start: { account: 'pending', signsIn: 'no', waiting: 0 },
    steps: [
      {
        what: 'The source sends a customer with the same address.',
        actor: 'system',
        action: 'submit',
        // The run goes through, the row not: an address proves no identity, so
        // it is refused as unclaimed, and nothing is created.
        expect: { run: 'applied' },
      },
      {
        what: 'The source sends it again, this time asking to claim it.',
        actor: 'system',
        action: 'submit',
        args: { claimByEmail: true },
        // A claim is never automatic, whatever the policy would allow: it
        // changes which account a key means from then on.
        expect: {
          run: 'waiting',
          waiting: 1,
          shopMail: ['customerSyncWaiting'],
        },
      },
      {
        what: 'A manager reads what it would adopt, and applies it.',
        actor: 'manager',
        action: 'apply',
        // Adopted and approved in one move: the registration was waiting for a
        // decision, and the source system has just made it.
        expect: {
          run: 'applied',
          account: 'invited',
          waiting: 0,
          customerMail: ['invitationApproved'],
        },
      },
      {
        what: 'They set a password from the link and sign in.',
        actor: 'customer',
        action: 'setPassword',
        expect: { account: 'active', signsIn: 'yes' },
      },
    ],
  },
  {
    slug: 'exchange-breaks-and-recovers',
    title: 'An exchange that breaks, stays broken, and comes back',
    note: 'The same change-of-state rule the catalog feed follows, in its own words and on its own state. A customer exchange that stops at midnight would otherwise write the same mail until somebody read one — and a mail about accounts that announced itself as a catalog update would be wrong in the only line an inbox shows.',
    given: 'An exchange nobody has heard from yet.',
    start: { run: 'none', waiting: 0 },
    steps: [
      {
        what: 'The source sends an ordinary customer export.',
        actor: 'system',
        action: 'submit',
        expect: {
          run: 'applied',
          account: 'invited',
          customerMail: ['invitationCreated'],
        },
      },
      {
        what: 'The next run breaks.',
        actor: 'system',
        action: 'reportFailure',
        expect: { run: 'failed', shopMail: ['customerSyncFailed'] },
      },
      {
        what: 'It breaks again twenty minutes later.',
        actor: 'system',
        action: 'reportFailure',
        // Nothing. The exchange's state has not changed, and the shop has
        // already been told where it stands.
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
        // Recovery is announced once, to whoever heard of the break; the run
        // changes nothing.
        expect: { run: 'no change', shopMail: ['customerSyncRecovered'] },
      },
    ],
  },
];
