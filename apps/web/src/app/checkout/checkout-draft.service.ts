import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import {
  AddressInput,
  FulfilmentMethod,
  OrderContact,
  PAYMENT_METHODS,
  PaymentMethod,
} from '@b2b-catalog-platform/shared';

/** Where the checkout draft lives, named here because the specs read it too. */
export const CHECKOUT_DRAFT_KEY = 'checkout-draft';

/** Bump when a stored draft can no longer be read by this code. A mismatch is
 * discarded rather than migrated: a draft is a few answers, and a
 * half-understood one would prefill a form with values nobody chose. */
export const CHECKOUT_DRAFT_VERSION = 1;

/**
 * Who the invoice is made out to. `account` is the party the account is
 * registered as; `other` is anybody else (FR-CART-09), whose order is priced
 * provisionally because the customer's price group belongs to the account
 * rather than to the party being invoiced.
 */
export type PartyChoice = 'account' | 'other';

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
  party: PartyChoice;
  /** Only meaningful for `other`: the name and number that go onto the billing
   * address at submit. */
  otherPartyName: string | null;
  otherPartyId: string | null;
  contact: OrderContact | null;
  /** ISO `YYYY-MM-DD`, or null. Travels as `preferredTiming`, which is a note
   * to a manager rather than a booked window. */
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
    party: 'account',
    otherPartyName: null,
    otherPartyId: null,
    contact: null,
    preferredDate: null,
    paymentMethod: 'cash',
    customerNote: null,
  };
}

interface StoredDraft {
  version: number;
  draft: CheckoutDraft;
}

/**
 * The checkout form's answers, kept across the two screens and across a trip
 * back to the cart.
 *
 * Session storage rather than a cookie: a cookie would be sent to the API and
 * to the rendering process on every request, and this is two addresses and a
 * note that neither has any use for. It dies with the tab, which is the right
 * lifetime — an abandoned checkout is not a promise to come back to it.
 *
 * SSR-safe the way the cart is: storage is touched only in the browser.
 */
@Injectable({ providedIn: 'root' })
export class CheckoutDraftService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly state = signal<CheckoutDraft>(this.read());

  readonly draft = this.state.asReadonly();

  /** Folds a few answers into the draft and writes it down. Partial, because
   * each row of the form owns its own fields and none of them knows the rest. */
  patch(changes: Partial<CheckoutDraft>): void {
    this.state.update((draft) => ({ ...draft, ...changes }));
    this.persist();
  }

  /** After a submitted order: the answers described an order that now exists,
   * and the next one starts from the account again rather than from them. */
  clear(): void {
    this.state.set(emptyDraft());
    if (!this.isBrowser) return;
    try {
      sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
    } catch {
      // Nothing to do: a browser that will not forget a draft still works.
    }
  }

  private persist(): void {
    if (!this.isBrowser) return;
    try {
      const payload: StoredDraft = {
        version: CHECKOUT_DRAFT_VERSION,
        draft: this.state(),
      };
      sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(payload));
    } catch {
      // A draft that cannot be written down is a form that has to be filled
      // again — worth nothing being said about, unlike a cart that is lost.
    }
  }

  /**
   * Anything unreadable is discarded whole. Only the two enums are checked on
   * the way in: they decide which half of the form is drawn, and a stored
   * value outside them would draw neither. The rest reaches a form control
   * that validates it, and the server after that.
   */
  private read(): CheckoutDraft {
    if (!this.isBrowser) return emptyDraft();
    try {
      const raw = sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
      if (!raw) return emptyDraft();
      const parsed = JSON.parse(raw) as StoredDraft | null;
      if (parsed?.version !== CHECKOUT_DRAFT_VERSION || !parsed.draft) {
        return emptyDraft();
      }
      const empty = emptyDraft();
      const draft = { ...empty, ...parsed.draft };
      return {
        ...draft,
        fulfilmentMethod:
          draft.fulfilmentMethod === 'pickup' ? 'pickup' : 'delivery',
        paymentMethod: isPaymentMethod(draft.paymentMethod)
          ? draft.paymentMethod
          : empty.paymentMethod,
        party: draft.party === 'other' ? 'other' : 'account',
      };
    } catch {
      return emptyDraft();
    }
  }
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly unknown[]).includes(value);
}
