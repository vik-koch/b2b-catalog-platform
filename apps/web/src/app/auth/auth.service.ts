import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import {
  authContract,
  AuthUser,
  ChangePasswordRequest,
  LoginRequest,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

/** What the login form needs to distinguish: bad credentials vs. anything else. */
export type LoginResult = 'ok' | 'invalid' | 'error';

/**
 * What the change-password form needs to distinguish. `wrong-current` is the
 * only failure the user can act on by correcting a field; `error` covers the
 * rest (expired session, server trouble).
 */
export type ChangePasswordResult = 'ok' | 'wrong-current' | 'error';

/**
 * The browser's view of the session. The token itself lives in an
 * httpOnly cookie, so page JavaScript can neither read nor forge it — asking
 * `GET /auth/me` is the only way to learn who, if anyone, is signed in. Every
 * gate this state drives is cosmetic; the API re-checks the cookie and the
 * database role on each request.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly client = createApiClient(authContract);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // `undefined` until /auth/me answers. Callers read it through `user()`, which
  // folds "not known yet" into "signed out" — so the chrome on a server-rendered
  // public page matches what the server emitted, which never resolves a session.
  private readonly session = signal<AuthUser | null | undefined>(undefined);

  /** The signed-in user, or `null` when signed out (or not yet resolved). */
  readonly user = computed(() => this.session() ?? null);

  /**
   * Whether `user()` is an answer rather than a placeholder. `user()` folds
   * "not known yet" into "signed out", which is right for chrome that must
   * match the server's render — but a page deciding whether to show a visitor
   * an error has to be able to wait for the real answer instead.
   */
  readonly resolved = computed(() => this.session() !== undefined);

  // Kicked off once, at app start, and only in the browser. The server is
  // deliberately left session-blind: it would have to forward the visitor's
  // cookie to the API, and the answer would then land in the SSR HTML — making
  // every rendered page visitor-specific, hence uncacheable. The session-scoped
  // routes are client-rendered precisely so nothing needs that.
  private readonly ready: Promise<void> = this.isBrowser
    ? this.refresh()
    : Promise.resolve();

  /** Resolves once the session is known either way; awaited by the guards. */
  whenResolved(): Promise<void> {
    return this.ready;
  }

  async login(credentials: LoginRequest): Promise<LoginResult> {
    try {
      const response = await this.client.login({ body: credentials });
      if (response.status === 200) {
        this.session.set(response.body);
        return 'ok';
      }
      // 401 is the deliberately vague "invalid email or password"; anything
      // else (429 from the login throttle, 5xx) is not the user's fault.
      return response.status === 401 ? 'invalid' : 'error';
    } catch {
      return 'error';
    }
  }

  /**
   * Change the signed-in user's own password. On success the server re-issues
   * the session cookie at the new tokenVersion and returns the refreshed
   * identity, so the local state (notably `mustChangePassword`) comes straight
   * from the response — no follow-up /auth/me needed.
   */
  async changePassword(
    request: ChangePasswordRequest,
  ): Promise<ChangePasswordResult> {
    try {
      const response = await this.client.changePassword({ body: request });
      if (response.status === 200) {
        this.session.set(response.body);
        return 'ok';
      }
      // 400 is specifically "current password is incorrect" — the only field
      // error this endpoint reports, since the new password's rules are checked
      // client-side and by the contract before the request goes out.
      return response.status === 400 ? 'wrong-current' : 'error';
    } catch {
      return 'error';
    }
  }

  /**
   * Clears the session. The local state is dropped even if the call fails —
   * the cookie may well be gone already (expired, or cleared server-side), and
   * leaving a stale "signed in" chrome behind would be the worse outcome.
   */
  async logout(): Promise<void> {
    try {
      await this.client.logout({ body: {} });
    } finally {
      this.session.set(null);
    }
  }

  private async refresh(): Promise<void> {
    try {
      const response = await this.client.me();
      this.session.set(response.status === 200 ? response.body : null);
    } catch {
      this.session.set(null);
    }
  }
}
