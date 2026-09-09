import type { Journey } from '../support/journey/journey';

/**
 * The journeys an account can take, as data.
 *
 * Read twice, like the order ones: `account-journeys.spec.ts` walks them
 * against the running API, and `tools/generate-account-lifecycle.mjs` renders
 * them into `docs/account-lifecycle.md`. The documentation therefore states
 * what is checked, and every check is documented.
 *
 * What they are for is the two things a per-endpoint test cannot see. **What
 * the account holder is told**, across a sequence of staff decisions — most of
 * these steps assert that *nothing* was sent, which is a claim no single test
 * makes and every mail template can break. And **whether the password still
 * works**, which is a fact accumulated over a switch-off and a switch-on and is
 * invisible at the moment it is lost.
 */

export interface AccountJourney extends Journey {
  /** Nothing yet, and deliberately: an account journey starts from an address
   * nobody has registered, which is the same starting point every time. */
  readonly account?: Record<string, never>;
}

export const accountJourneys: readonly AccountJourney[] = [
  {
    slug: 'registration-approved',
    title: 'A registration, approved',
    note: 'The ordinary way a customer arrives: they ask, the shop decides, and only then is there an account to sign into. The price group is assigned in the same act and is never mentioned to them.',
    given: 'An address nobody has registered.',
    start: {
      status: 'gone',
      role: null,
      tier: null,
      signsIn: 'no',
      waitingOnShop: '—',
    },
    steps: [
      {
        what: 'Somebody registers.',
        actor: 'customer',
        action: 'register',
        // A registration is a request, not an account: it can be read by staff
        // and cannot be signed into, and the receipt says exactly that.
        expect: {
          status: 'pending',
          role: 'user',
          tier: 'base',
          waitingOnShop: '🟡',
          mail: ['registrationReceived'],
        },
      },
      {
        what: 'A manager approves it and puts them on the wholesale list.',
        actor: 'manager',
        action: 'approve',
        args: { tier: 'wholesale' },
        // `invited`, not `active`: approval decides that they are a customer,
        // and choosing a password is still theirs to do. The price group is
        // part of the same decision and never appears in the mail.
        expect: {
          status: 'invited',
          tier: 'wholesale',
          waitingOnShop: '—',
          mail: ['invitationApproved'],
        },
      },
      {
        what: 'They follow the link and choose a password.',
        actor: 'customer',
        action: 'choosePassword',
        expect: { status: 'active', signsIn: 'yes' },
      },
    ],
  },
  {
    slug: 'registration-declined',
    title: 'A registration the shop turns down',
    note: 'Declining is a deletion, not a status: nothing was ever an account. Nobody is written to — the shop is not obliged to tell a stranger why it will not trade with them, and a mail would be one.',
    given: 'An address nobody has registered.',
    start: { status: 'gone', waitingOnShop: '—' },
    steps: [
      {
        what: 'Somebody registers.',
        actor: 'customer',
        action: 'register',
        expect: {
          status: 'pending',
          role: 'user',
          tier: 'base',
          waitingOnShop: '🟡',
          mail: ['registrationReceived'],
        },
      },
      {
        what: 'A manager declines it.',
        actor: 'manager',
        action: 'decline',
        expect: {
          status: 'gone',
          role: null,
          tier: null,
          waitingOnShop: '—',
        },
      },
    ],
  },
  {
    slug: 'staff-created',
    title: 'An account the shop sets up',
    note: 'A customer the shop already deals with off the platform, or a colleague. There is no registration to approve, so the account exists from the first click — with the wording that says where it came from.',
    given: 'An address nobody has registered.',
    start: { status: 'gone', signsIn: 'no' },
    steps: [
      {
        what: 'A manager creates the account.',
        actor: 'manager',
        action: 'createByStaff',
        // Never in the shop's queue: nobody asked for this one, so there is
        // nothing for a manager to decide.
        expect: {
          status: 'invited',
          role: 'user',
          tier: 'base',
          waitingOnShop: '—',
          mail: ['invitationCreated'],
        },
      },
      {
        what: 'They follow the link and choose a password.',
        actor: 'customer',
        action: 'choosePassword',
        expect: { status: 'active', signsIn: 'yes' },
      },
    ],
  },
  {
    slug: 'switched-off-and-back-on',
    title: 'Switched off, and switched back on',
    note: 'The one worth reading. Switching an account off takes its access away and nothing else: the password stays, so switching it back on returns the account its owner had — silently, with no mail in either direction. As far as they are concerned nothing happened, which is the point: a customer who stopped ordering for a season should not be greeted by a message telling them their account was shut.',
    given: 'A customer who registered, was approved, and chose a password.',
    from: [
      { what: 'They registered.', actor: 'customer', action: 'register' },
      {
        what: 'A manager approved it.',
        actor: 'manager',
        action: 'approve',
        args: { tier: 'wholesale' },
      },
      {
        what: 'They chose a password.',
        actor: 'customer',
        action: 'choosePassword',
      },
    ],
    start: { status: 'active', signsIn: 'yes', tier: 'wholesale' },
    steps: [
      {
        what: 'A manager switches the account off.',
        actor: 'manager',
        action: 'deactivate',
        // The status is what refuses the sign-in — and it refuses the session
        // already in flight too, which no reading here can show.
        expect: { status: 'disabled', signsIn: 'no' },
      },
      {
        what: 'A manager switches it back on.',
        actor: 'manager',
        action: 'reactivate',
        // Straight back to `active`, and the same password opens it. Nothing
        // was sent at either end.
        expect: { status: 'active', signsIn: 'yes' },
      },
    ],
  },
  {
    slug: 'switched-off-before-first-use',
    title: 'Switched off before it was ever used',
    note: 'The exception to the one above. An account whose owner never chose a password has nothing to come back to, so switching it on lands it where a link can still be sent — and sending one is a deliberate act, not something a status change does behind a manager’s back.',
    given: 'A registration that was approved and never opened.',
    from: [
      { what: 'They registered.', actor: 'customer', action: 'register' },
      {
        what: 'A manager approved it.',
        actor: 'manager',
        action: 'approve',
        args: { tier: null },
      },
    ],
    start: { status: 'invited', signsIn: 'no', tier: 'base' },
    steps: [
      {
        what: 'A manager switches the account off.',
        actor: 'manager',
        action: 'deactivate',
        // The invitation that was out is retired with it: a live link into an
        // account nobody may sign into is a way round the decision.
        expect: { status: 'disabled' },
      },
      {
        what: 'A manager switches it back on.',
        actor: 'manager',
        action: 'reactivate',
        // `invited`, not `active`: there is no password to come back to, and
        // an account that says it is active while nothing opens it would be
        // the one status nobody could act on.
        expect: { status: 'invited', signsIn: 'no' },
      },
      {
        what: 'A manager sends them a link.',
        actor: 'manager',
        action: 'sendPasswordLink',
        expect: { mail: ['invitationApproved'] },
      },
      {
        what: 'They follow it and choose a password.',
        actor: 'customer',
        action: 'choosePassword',
        expect: { status: 'active', signsIn: 'yes' },
      },
    ],
  },
  {
    slug: 'locked-out',
    title: 'Locked out, and let back in',
    note: 'Somebody who has forgotten their password rings the shop as readily as they use the form, so staff can send the link on their behalf. It is the same link and the same mail either way — and the account is untouched until they actually choose a new password.',
    given: 'A signed-up customer who has forgotten their password.',
    from: [
      { what: 'They registered.', actor: 'customer', action: 'register' },
      {
        what: 'A manager approved it.',
        actor: 'manager',
        action: 'approve',
        args: { tier: null },
      },
      {
        what: 'They chose a password.',
        actor: 'customer',
        action: 'choosePassword',
      },
    ],
    start: { status: 'active', signsIn: 'yes' },
    steps: [
      {
        what: 'They ask for a link from the login form.',
        actor: 'customer',
        action: 'forgotPassword',
        // The account is not touched by asking: the old password keeps working
        // until a new one is chosen, so a link somebody else asked for cannot
        // lock its owner out.
        expect: { mail: ['passwordReset'] },
      },
      {
        what: 'A manager sends the same link, because they rang instead.',
        actor: 'manager',
        action: 'sendPasswordLink',
        expect: { mail: ['passwordReset'] },
      },
      {
        what: 'They follow it and choose a password.',
        actor: 'customer',
        action: 'choosePassword',
        expect: { status: 'active', signsIn: 'yes' },
      },
    ],
  },
  {
    slug: 'closed-by-its-owner',
    title: 'Closed by its owner',
    note: 'Deleting an account anonymizes it rather than removing it (FR-AUTH-06): the past orders it placed have to keep referring to something. What goes is everything that says who the person was — including the email, which is why the row is read by id from here on.',
    given: 'A signed-up customer who wants their account gone.',
    from: [
      { what: 'They registered.', actor: 'customer', action: 'register' },
      {
        what: 'A manager approved it.',
        actor: 'manager',
        action: 'approve',
        args: { tier: null },
      },
      {
        what: 'They chose a password.',
        actor: 'customer',
        action: 'choosePassword',
      },
    ],
    start: { status: 'active', signsIn: 'yes' },
    steps: [
      {
        what: 'They delete the account from their own page.',
        actor: 'customer',
        action: 'closeAccount',
        // A tombstone: the row is still there, and nothing about the person
        // is. The confirmation goes to the address a moment before it stops
        // being theirs.
        expect: {
          status: 'anonymized',
          signsIn: 'no',
          mail: ['accountDeleted'],
        },
      },
    ],
  },
];
