import {
  FulfilmentMethod,
  OrderContact,
  PAYMENT_METHODS,
  PaymentMethod,
} from '@b2b-catalog-platform/shared/core/ordering';
import { AddressInput } from '@b2b-catalog-platform/shared/core/accounts';

/** Where the checkout draft lives, named here because the specs read it too. */
export const CHECKOUT_DRAFT_KEY = 'checkout-draft';

/** Bump when a stored draft can no longer be read by this code. A mismatch is
 * discarded rather than migrated: a draft is a few answers, and a
 * half-understood one would prefill a form with values nobody chose. */
export const CHECKOUT_DRAFT_VERSION = 1;

/**
 * Who the invoice is made out to. `account` is the party the account is
 * registered as; the other two are anybody else (FR-CART-09), whose order is
 * priced provisionally because the customer's price group belongs to their
 * account rather than to the party being invoiced.
 *
 * A person and a company are separate choices rather than one "somebody else"
 * with optional fields: a company always has a registration number here — a
 * sole trader in a jurisdiction that numbers them included — and a person never
 * does, so asking one question with an optional half asked neither clearly.
 */
export type PartyChoice = 'account' | 'person' | 'company';

/**
 * The answers the checkout form holds between the two screens, and between a
 * visit to the cart and coming back.
 *
 * It is a draft, not a submission: every field is optional-shaped and nothing
 * here is trusted. The form re-validates it, and the server re-validates that.
 *
 * `deliveryAddressId` null with `newDeliveryAddress` set is an address being
 * typed rather than picked; both null is "nothing chosen yet".
 */
export interface CheckoutDraft {
  fulfilmentMethod: FulfilmentMethod;
  pickupLocationKey: string | null;
  deliveryAddressId: string | null;
  newDeliveryAddress: AddressInput | null;
  /** Unchecking this is what reveals the second address picker. */
  billingSameAsDelivery: boolean;
  billingAddressId: string | null;
  newBillingAddress: AddressInput | null;
  /** Whether a typed address is kept in the book afterwards. Checked by
   * default: an address typed at checkout is one the customer orders to. */
  saveDeliveryAddress: boolean;
  saveBillingAddress: boolean;
  /**
   * Whether the book has already chosen this checkout's defaults. Without it,
   * every re-read of the book would undo a customer's move to "a different
   * address".
   */
  addressesSeeded: boolean;
  party: PartyChoice;
  /** Only meaningful where the party is not the account's own. */
  otherPartyName: string | null;
  otherPartyId: string | null;
  contact: OrderContact | null;
  /** ISO `YYYY-MM-DD`, or null. A wish a manager works from, not a booked
   * window. */
  preferredDate: string | null;
  paymentMethod: PaymentMethod;
  customerNote: string | null;
}

/** What the form arrives answered with before anything is known about the
 * account: delivery, invoiced to the account's own party, paid cash. */
export function emptyDraft(): CheckoutDraft {
  return {
    fulfilmentMethod: 'delivery',
    pickupLocationKey: null,
    deliveryAddressId: null,
    newDeliveryAddress: null,
    billingSameAsDelivery: true,
    billingAddressId: null,
    newBillingAddress: null,
    saveDeliveryAddress: true,
    saveBillingAddress: true,
    addressesSeeded: false,
    party: 'account',
    otherPartyName: null,
    otherPartyId: null,
    contact: null,
    preferredDate: null,
    paymentMethod: 'cash',
    customerNote: null,
  };
}
