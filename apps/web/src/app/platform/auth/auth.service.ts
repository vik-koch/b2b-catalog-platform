import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  DOCUMENT,
  inject,
  Injectable,
  PLATFORM_ID,
  REQUEST,
  signal,
} from '@angular/core';
import { safe } from '@orpc/client';
import { sessionContract } from '../contract-routes.generated';
import { createOrpcClient } from '../orpc-client';
import { sessionCookieIn } from './session-cookie';
import { readSessionHint } from './session-hint';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

/**
 * The browser's view of the session. The token is an httpOnly cookie, so
 * `/auth/me` is the only way to learn who is signed in. Every gate this drives
 * is cosmetic: the API checks each request.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client = createOrpcClient(sessionContract);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);

  /** The readable hint cookie, read once, for a right first frame. Null on
   * the server, which renders one document for everybody. */
  readonly hintedRole = signal(
    this.isBrowser ? readSessionHint(this.document.cookie) : null,
  ).asReadonly();

  // `undefined` until /auth/me answers.
  private readonly session = signal<AuthUser | null | undefined>(undefined);

  /** Null when signed out or not yet known: what a guest's render draws. */
  readonly user = computed(() => this.session() ?? null);

  /** Whether `user()` is an answer, for a page that must wait for one. */
  readonly resolved = computed(() => this.session() !== undefined);

  // The server asks only for a render with a session cookie (a guest's would
  // be a 401 per view); its answer reaches the browser in the transfer cache.
  private readonly ready: Promise<void> =
    this.isBrowser ||
    sessionCookieIn(inject(REQUEST, { optional: true })?.headers.get('cookie'))
      ? this.refresh()
      : Promise.resolve();

  /** Awaited by the guards. */
  whenResolved(): Promise<void> {
    return this.ready;
  }

  /** A session the API just started: a sign-in, or a re-issued one. */
  start(user: AuthUser): void {
    this.session.set(user);
  }

  /** The local state goes even if the call fails: stale chrome is worse. */
  async logout(): Promise<void> {
    try {
      await this.client.logout();
    } finally {
      this.session.set(null);
      this.dropPrePaintHint();
    }
  }

  /** Also after an edit to what the session says, such as the first name. */
  async refresh(): Promise<void> {
    try {
      const { error, data } = await safe(this.client.me());
      this.session.set(error ? null : data);
    } catch {
      this.session.set(null);
    } finally {
      this.dropPrePaintHint();
    }
  }

  /** Hands the account control back from the pre-paint class, so a stale
   * hint cannot outlive the API's answer (see `session-shell.server.ts`). */
  private dropPrePaintHint(): void {
    if (!this.isBrowser) return;
    this.document.documentElement.classList.remove(
      'session-known',
      'session-anonymous',
    );
  }
}
