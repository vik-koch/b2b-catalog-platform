import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import {
  CHECKOUT_DRAFT_KEY,
  CHECKOUT_DRAFT_VERSION,
  CheckoutDraft,
  emptyDraft,
  PartyChoice,
} from './checkout-draft';
import {
  PAYMENT_METHODS,
  PaymentMethod,
} from '@b2b-catalog-platform/shared/core/ordering';

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
        party: isPartyChoice(draft.party) ? draft.party : 'account',
      };
    } catch {
      return emptyDraft();
    }
  }
}

function isPartyChoice(value: unknown): value is PartyChoice {
  return value === 'account' || value === 'person' || value === 'company';
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly unknown[]).includes(value);
}
