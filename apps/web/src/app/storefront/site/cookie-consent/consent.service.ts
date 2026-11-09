import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';

import { SITE_CONFIG } from '../../../core/site/site-config';

export type ConsentChoice = 'accepted' | 'rejected';

export interface ConsentDecision {
  readonly version: number;
  readonly choice: ConsentChoice;
  readonly timestamp: string;
}

/**
 * Bump when the cookie policy materially changes: records from an older
 * version are ignored, so the banner re-solicits consent.
 */
const CONSENT_VERSION = 1;

// The decision record is itself strictly-necessary storage (remembering the
// choice), so it is exempt from consent. localStorage keeps it client-only and
// off every request, unlike a cookie.
const STORAGE_KEY = 'cookie-consent';

/** The visitor's cookie choice, for non-essential storage only: the session
 * and this record are set regardless. localStorage only in the browser; the
 * server never has a decision. */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly decision = signal<ConsentDecision | null>(this.read());

  /** Whether the consent mechanism is active at all for this deployment. */
  readonly enabled = inject(SITE_CONFIG).cookieConsentEnabled;

  /** True while the visitor still has to make (or remake) a choice. */
  readonly needsDecision = computed(
    () => this.enabled && this.decision() === null,
  );

  /** The current choice, or null if none has been recorded. */
  readonly choice = computed(() => this.decision()?.choice ?? null);

  /** Whether non-essential storage and embeds may load: consent not enforced
   * here (flag off), or accepted. Gated widgets check it first. */
  readonly canUse = computed(
    () => !this.enabled || this.choice() === 'accepted',
  );

  accept(): void {
    this.persist('accepted');
  }

  reject(): void {
    this.persist('rejected');
  }

  /** Reopens the choice, from a persistent "Cookie settings" control, so
   * withdrawing is as easy as giving. */
  withdraw(): void {
    if (this.isBrowser) {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.decision.set(null);
  }

  private persist(choice: ConsentChoice): void {
    const decision: ConsentDecision = {
      version: CONSENT_VERSION,
      choice,
      timestamp: new Date().toISOString(),
    };
    if (this.isBrowser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decision));
    }
    this.decision.set(decision);
  }

  private read(): ConsentDecision | null {
    if (!this.isBrowser) {
      return null;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as ConsentDecision) : null;
      return parsed?.version === CONSENT_VERSION ? parsed : null;
    } catch {
      return null;
    }
  }
}
