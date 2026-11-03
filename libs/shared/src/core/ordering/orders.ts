/**
 * Where an order stands (FR-ORD-01), in the order it moves through. Payment
 * is a second axis (`PAYMENT_STATES`): cash is paid after the handover, which
 * one chain cannot say. `ready` reads as "ready for pickup" or "handed over
 * for delivery" by `fulfilmentMethod`, never as two values.
 */
export const ORDER_STATUSES = [
  'requested',
  'approved',
  'ready',
  'completed',
  'declined',
  'cancelled',
] as const;

export const ACCEPTED_ORDER_STATUSES = ['approved'] as const;

/**
 * Why a version of an order was written (FR-ORD-03). Recorded rather than
 * derived by comparing rows: the staff timeline and the customer's mail both
 * read it.
 */
export const ORDER_REVISION_KINDS = [
  'submitted',
  'transition',
  'adjustment',
] as const;

/**
 * What a message to the customer is about (FR-NOTIF-03). The same `approved`
 * can be an acceptance, a step back or a change, and those are three different
 * pieces of news.
 */
export const ORDER_NOTICES = ['moved', 'corrected', 'changed'] as const;

/** The two ways an order ends without being filled. Both carry a reason. */
export const ENDED_ORDER_STATUSES = ['declined', 'cancelled'] as const;

/**
 * Filled or ended, and owed nothing (NFR-LEGAL-14): only such an order may
 * lose its personal details.
 */
export function isOrderFinished(status: string, paymentState: string): boolean {
  return (
    (status === 'completed' ||
      (ENDED_ORDER_STATUSES as readonly string[]).includes(status)) &&
    paymentState !== 'awaiting'
  );
}

/**
 * Whether the money arrived (FR-ORD-04). A flag, not a ledger: refunds and
 * partial payments belong in the shop's books.
 */
export const PAYMENT_STATES = ['not-due', 'awaiting', 'paid'] as const;

/** Cash is the exception: it is only ever paid at the handover. */
export const PAYMENT_METHODS_DUE_ON_ACCEPTANCE = [
  'bank-transfer',
  'card-later',
] as const;

/**
 * The staff list's payment filter (FR-ORD-04). `cash` is an accepted cash
 * order with no handover recorded, which the state axis cannot say; `unpaid`
 * exists so a work-queue count links to exactly the rows it counted.
 */
export const STAFF_PAYMENT_FILTERS = [
  'awaiting',
  'cash',
  'unpaid',
  'paid',
] as const;

/** One value per queue the customer's panel counts (FR-WORK-03). */
export const MY_ORDER_FILTERS = ['to-pay', 'to-collect'] as const;

export const ORDER_STATUS_REASON_MAX = 500;

/** Optional on the wire: a system writing an adjustment back has nobody to
 * ask. The screen asks for it. */
export const ORDER_ADJUSTMENT_NOTE_MAX = 500;

/** `status` first: the unanswered orders on top (FR-AUTH-03). */
export const STAFF_ORDER_SORTS = [
  'status',
  'status_desc',
  'placed',
  'placed_desc',
] as const;

export const FULFILMENT_METHODS = ['delivery', 'pickup'] as const;

/** `card-later` is arranged with the manager: the platform takes no payment. */
export const PAYMENT_METHODS = ['cash', 'bank-transfer', 'card-later'] as const;

export const ORDER_NOTE_MAX = 1000;

export const PICKUP_LOCATION_KEY_MAX = 64;

export const PARTY_NAME_MAX = 255;

export const ORDER_PAGE_SIZE = 20;

/** As long as the longest thing anybody pastes in: an email address. */
export const ORDER_QUERY_MAX_LENGTH = 200;

/** The owning system's own name for whoever acted (FR-ADM-08): an opaque
 * label, never resolved to an account. */
export const ORDER_WRITE_ACTOR_MAX = 200;
