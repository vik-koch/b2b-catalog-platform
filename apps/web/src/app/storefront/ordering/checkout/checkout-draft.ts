import {
  FulfilmentMethod,
  OrderContact,
  PaymentMethod,
} from '@b2b-catalog-platform/shared/core/ordering';
import { AddressInput } from '@b2b-catalog-platform/shared/core/accounts';

/** The storage key; the specs read it too. */
export const CHECKOUT_DRAFT_KEY = 'checkout-draft';

/** Bump when a stored draft can no longer be read. A mismatch is discarded, not
 * migrated. */
export const CHECKOUT_DRAFT_VERSION = 1;

/** Who is invoiced. `account` is the account's registered party; the other two
 * (FR-CART-09) are priced provisionally, as the price group belongs to the
 * account. Person and company are separate: a company always has a registration
 * number, a person never. */
export type PartyChoice = 'account' | 'person' | 'company';

/** The checkout's answers across both screens and a trip to the cart.
 * Untrusted: the form and the server validate them. A null `deliveryAddressId`
 * with `newDeliveryAddress` set is a typed address; both null is nothing
 * chosen. */
export interface CheckoutDraft {
  fulfilmentMethod: FulfilmentMethod;
  pickupLocationKey: string | null;
  deliveryAddressId: string | null;
  newDeliveryAddress: AddressInput | null;
  /** Unchecked, the second address picker shows. */
  billingSameAsDelivery: boolean;
  billingAddressId: string | null;
  newBillingAddress: AddressInput | null;
  /** Whether a typed address is kept in the book. Checked by default. */
  saveDeliveryAddress: boolean;
  saveBillingAddress: boolean;
  /** Set once the book has chosen the defaults, so a re-read cannot undo the
   * customer's choice. */
  addressesSeeded: boolean;
  party: PartyChoice;
  /** Only meaningful where the party is not the account's own. */
  otherPartyName: string | null;
  otherPartyId: string | null;
  contact: OrderContact | null;
  /** ISO `YYYY-MM-DD`: a wish, not a booked window. */
  preferredDate: string | null;
  paymentMethod: PaymentMethod;
  customerNote: string | null;
}

/** Before anything is known: delivery, the account's party, cash. */
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
