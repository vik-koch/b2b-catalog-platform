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
  PasswordTokenPurpose,
  RegisterRequest,
  SetPasswordRequest,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

/** What the login form needs to distinguish: bad credentials vs. anything else. */
export type LoginResult = 'ok' | 'invalid' | 'error';

/**
 * What the change-password form needs to distinguish. Two of these are 400s
 * the user can act on — the current password was wrong, or the new one was
 * refused — and the API tells them apart with a `code` so the form never has
 * to guess which message to show.
 */
export type ChangePasswordResult =
  | { result: 'ok' }
  | { result: 'wrong-current' }
  /** The policy refused the *new* password; `message` says why, in its words. */
  | { result: 'rejected'; message: string }
  | { result: 'error' };

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

  /**
   * Request an account (FR-AUTH-01). Deliberately learns nothing: the server
   * answers the same whether the address was new or already registered, so
   * there is no result to distinguish beyond "the request went through".
   * Nothing about the session changes — the account cannot sign in until staff
   * approve it.
   */
  async register(request: RegisterRequest): Promise<'ok' | 'error'> {
    try {
      const response = await this.client.register({ body: request });
      return response.status === 200 ? 'ok' : 'error';
    } catch {
      return 'error';
    }
  }

  /**
   * What a set-a-password link is for, or null when it is no good — expired,
   * already used, or never issued, which the API deliberately does not
   * distinguish.
   */
  async checkPasswordToken(
    token: string,
  ): Promise<{ purpose: PasswordTokenPurpose; email: string } | null> {
    try {
      const response = await this.client.checkPasswordToken({
        params: { token },
      });
      return response.status === 200 ? response.body : null;
    } catch {
      return null;
    }
  }

  /**
   * Redeem the link. On success the server signs the visitor in, so the local
   * session state comes straight from the response — they are already through.
   * A rejected password comes back as its own message, because it is the one
   * failure the visitor can act on by typing something else.
   */
  async setPassword(request: SetPasswordRequest): Promise<{
    result: 'ok' | 'rejected' | 'expired' | 'error';
    message?: string;
  }> {
    try {
      const response = await this.client.setPassword({ body: request });
      if (response.status === 200) {
        this.session.set(response.body);
        return { result: 'ok' };
      }
      if (response.status === 400) {
        return { result: 'rejected', message: response.body.message };
      }
      return { result: response.status === 404 ? 'expired' : 'error' };
    } catch {
      return { result: 'error' };
    }
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
        return { result: 'ok' };
      }
      if (response.status === 400) {
        return response.body.code === 'rejected'
          ? { result: 'rejected', message: response.body.message }
          : { result: 'wrong-current' };
      }
      return { result: 'error' };
    } catch {
      return { result: 'error' };
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
