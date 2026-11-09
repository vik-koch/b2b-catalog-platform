import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

import {
  PAYMENT_METHODS,
  PaymentMethod,
} from '@b2b-catalog-platform/shared/core/ordering';

import {
  CHECKOUT_DRAFT_KEY,
  CHECKOUT_DRAFT_VERSION,
  CheckoutDraft,
  emptyDraft,
  PartyChoice,
} from './checkout-draft';

interface StoredDraft {
  version: number;
  draft: CheckoutDraft;
}

/** The checkout draft in session storage: a cookie would travel with every
 * request, and an abandoned checkout should die with the tab. Touched only in
 * the browser. */
@Injectable({ providedIn: 'root' })
export class CheckoutDraftService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly state = signal<CheckoutDraft>(this.read());

  readonly draft = this.state.asReadonly();

  /** Partial: each row owns its own fields. */
  patch(changes: Partial<CheckoutDraft>): void {
    this.state.update((draft) => ({ ...draft, ...changes }));
    this.persist();
  }

  /** After an order is placed, the next one starts afresh. */
  clear(): void {
    this.state.set(emptyDraft());
    if (!this.isBrowser) return;
    try {
      sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
    } catch {
      // Nothing to do: a browser that keeps the draft still works.
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
      // An unwritten draft only costs refilling the form.
    }
  }

  /** Anything unreadable is discarded whole. Only the two enums are checked: a
   * value outside them draws neither half of the form. The fields and server
   * validate the rest. */
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
