/**
 * What an order may say and how much of it. Plain data with no imports, so
 * checkout does not pull the order schemas — and Zod — into the first load
 * (see `auth-constants.ts` for why).
 */

/**
 * Where an order stands (FR-ORD-01), in the order it moves through: a request
 * is answered, worked on, handed over and finished, or it ends as one of the
 * two refusals. Fulfilment only — what has been paid is a second fact
 * (`PAYMENT_STATES`), because cash is paid after the goods are handed over and
 * a single chain cannot say that.
 *
 * `ready` is one state read two ways: a collected order is ready for pickup, a
 * delivered one has been handed over to be delivered. The wording is a
 * rendering rule on `fulfilmentMethod`, never a second value that an order
 * could be in the wrong one of.
 *
 * `adjusted` is an acceptance too — the order the manager changed after
 * agreeing it on the phone — and the only difference from `approved` is what
 * the customer is told and that their cancel window re-opens. Nothing writes
 * it until adjustments exist; it is listed now so the check constraint and the
 * read contract agree from the start.
 */
export const ORDER_STATUSES = [
  'requested',
  'approved',
  'adjusted',
  'ready',
  'completed',
  'declined',
  'cancelled',
] as const;

/**
 * Why a version of an order exists (FR-ORD-03).
 *
 * The order's whole history is its thread of versions, so a version is written
 * for one of three reasons: the customer placed it, the shop moved it, or the
 * shop changed what it says. Recorded rather than worked out by comparing two
 * rows — the staff timeline reads it, and so does the decision whether a
 * customer's mail has to mention that the order itself changed.
 */
export const ORDER_REVISION_KINDS = [
  'submitted',
  'transition',
  'adjustment',
] as const;

 */
export const ACCEPTED_ORDER_STATUSES = ['approved', 'adjusted'] as const;

/** The two ways an order ends without being filled. Both carry a reason. */
export const ENDED_ORDER_STATUSES = ['declined', 'cancelled'] as const;

/**
 * Whether the order has been paid (FR-ORD-04), tracked apart from where it
 * stands.
 *
 * `not-due` is where every order starts and where a cash order stays: cash
 * exists only at the handover, so it goes straight to `paid` when a manager
 * records that. Bank transfer and card enter `awaiting` when the order is
 * accepted.
 *
 * A flag, not a ledger — partial payments, refunds and amounts received belong
 * in whatever system the shop keeps its books in.
 */
export const PAYMENT_STATES = ['not-due', 'awaiting', 'paid'] as const;

/**
 * Which payment methods become due on acceptance. Cash is the exception and
 * the reason the two axes are separate at all.
 */
export const PAYMENT_METHODS_DUE_ON_ACCEPTANCE = [
  'bank-transfer',
  'card-later',
] as const;

/**
 * What a manager narrows the payment column to (FR-ORD-04) — the three things
 * that column actually says, and nothing else. `cash` is not a payment state:
 * it is an accepted cash order nobody has recorded the handover for, which is
 * the one piece of money-work the state axis cannot express on its own.
 */
export const STAFF_PAYMENT_FILTERS = ['awaiting', 'cash', 'paid'] as const;

/** As long as a manager needs to say why, and no longer than a note. */
export const ORDER_STATUS_REASON_MAX = 500;

/**
 * What a manager writes about an adjustment (FR-ORD-03): what changed, and
 * what was agreed. The same length as a reason, because it is the same kind of
 * sentence and lands in the same mail.
 *
 * Optional in the contract and asked for by the screen. A person adjusting an
 * order has just been on the phone and can say what was agreed; a system
 * writing an adjustment back has nobody to ask, and refusing it for that would
 * be refusing the adjustment itself.
 */
export const ORDER_ADJUSTMENT_NOTE_MAX = 500;

/**
 * How the staff list is ordered (FR-AUTH-03).
 *
 * `status` is the default and the reason this exists: it puts the orders
 * nobody has answered yet at the top, which is the question the list is opened
 * with. Requested first, then approved, then the two ways an order ends; each
 * group newest first, as the list has always been.
 */
export const STAFF_ORDER_SORTS = [
  'status',
  'status_desc',
  'placed',
  'placed_desc',
] as const;

/** How the goods reach the customer. */
export const FULFILMENT_METHODS = ['delivery', 'pickup'] as const;

/**
 * How it is paid. `card-later` is a card payment arranged with the manager
 * after confirmation — the platform takes no payment itself, which is why no
 * method here implies a transaction.
 */
export const PAYMENT_METHODS = ['cash', 'bank-transfer', 'card-later'] as const;

export const ORDER_NOTE_MAX = 1000;

/** A key from the deployment's `locations`, validated against it server-side. */
export const PICKUP_LOCATION_KEY_MAX = 64;

/** Registration numbers are compared in one form everywhere. */
export const PARTY_NAME_MAX = 255;

export const ORDER_PAGE_SIZE = 20;

/** As long as the longest thing anybody pastes in: an email address. */
export const ORDER_QUERY_MAX_LENGTH = 200;

/**
 * What the plain transition endpoint may be asked for.
 *
 * Narrower than `ORDER_STATUSES` on purpose, and not a second copy of the
 * transition table: `adjusted` carries a new snapshot of the order, so it is
 * its own operation with its own payload rather than a target you can name
 * here.
 *
 * `requested` is in the list because reopening an ended order is a move like
 * any other — staff's undo for a click that was wrong. Whether it is allowed
 * from where the order stands is still the table's answer, not this list's.
 */
export const DIRECT_TRANSITION_TARGETS = [
  'requested',
  'approved',
  'ready',
  'completed',
  'declined',
  'cancelled',
] as const;
