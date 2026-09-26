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
import {
  AuthUser,
  ChangePasswordRequest,
  LoginRequest,
  PasswordRejectionCode,
  PASSWORD_TOKEN_INVALID,
  PasswordTokenPurpose,
  RegisterRequest,
  SetPasswordRequest,
} from '@b2b-catalog-platform/shared';
import { authContract } from '../core/contract-routes.generated';
import { createOrpcClient } from '../core/orpc-client';
import { sessionCookieIn } from './session-cookie';
import { readSessionHint } from './session-hint';

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
  /** The policy refused the *new* password; the code says which rule did. */
  | { result: 'rejected'; code: PasswordRejectionCode }
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
  private readonly client = createOrpcClient(authContract);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);

  /**
   * Who the browser's own cookies say is signed in, read once at start-up.
   *
   * The session cookie is httpOnly, so this is the readable hint beside it
   * (`SESSION_HINT_COOKIE`) — enough to draw the account control right on the
   * first frame instead of leaning one way for a round trip. Null on the
   * server, which renders one document for everybody.
   */
  readonly hintedRole = signal(
    this.isBrowser ? readSessionHint(this.document.cookie) : null,
  ).asReadonly();

  // `undefined` until /auth/me answers. Callers read it through `user()`, which
  // folds "not known yet" into "signed out" — the state a guest's render and
  // the first frames of any client-rendered route are drawn in.
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

  // Kicked off once, at app start. The server asks too, but only for a render
  // that carries a session cookie — a guest has nothing to ask about, and the
  // answer would be a 401 per page view. What the server learns rides to the
  // browser in the transfer cache, so the chrome it drew is the chrome that
  // hydrates, and the browser's own ask is answered from the document.
  private readonly ready: Promise<void> =
    this.isBrowser ||
    sessionCookieIn(inject(REQUEST, { optional: true })?.headers.get('cookie'))
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
    const { error } = await safe(this.client.register({ body: request }));
    return error ? 'error' : 'ok';
  }

  /**
   * Ask for a reset link (FR-AUTH-02). Learns nothing, like `register`: the
   * server answers the same for an address it knows and one it does not, so
   * the only failure worth reporting is the request not going through at all.
   */
  async forgotPassword(email: string): Promise<'ok' | 'error'> {
    const { error } = await safe(
      this.client.forgotPassword({ body: { email } }),
    );
    return error ? 'error' : 'ok';
  }

  /**
   * What a set-a-password link is for, or null when it is no good — expired,
   * already used, or never issued, which the API deliberately does not
   * distinguish.
   */
  async checkPasswordToken(
    token: string,
  ): Promise<{ purpose: PasswordTokenPurpose; email: string } | null> {
    const { error, data } = await safe(
      this.client.checkPasswordToken({ params: { token } }),
    );
    return error ? null : data;
  }

  /**
   * Redeem the link. On success the server signs the visitor in, so the local
   * session state comes straight from the response — they are already through.
   * A rejected password comes back with the rule that refused it, because it is
   * the one failure the visitor can act on by typing something else.
   */
  async setPassword(request: SetPasswordRequest): Promise<{
    result: 'ok' | 'rejected' | 'expired' | 'error';
    code?: PasswordRejectionCode;
  }> {
    const result = await safe(this.client.setPassword({ body: request }));

    if (result.isSuccess) {
      this.session.set(result.data);
      return { result: 'ok' };
    }
    if (!result.isDefined) return { result: 'error' };
    return result.error.code === PASSWORD_TOKEN_INVALID
      ? { result: 'expired' }
      : { result: 'rejected', code: result.error.code };
  }

  async login(credentials: LoginRequest): Promise<LoginResult> {
    const result = await safe(this.client.login({ body: credentials }));
    if (result.isSuccess) {
      this.session.set(result.data);
      return 'ok';
    }
    // `invalid-credentials` is the deliberately vague "invalid email or
    // password"; anything else (429 from the login throttle, 5xx) is not the
    // visitor's fault and must not be phrased as though it were.
    return result.isDefined ? 'invalid' : 'error';
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
    const result = await safe(this.client.changePassword({ body: request }));

    if (result.isSuccess) {
      this.session.set(result.data);
      return { result: 'ok' };
    }
    if (!result.isDefined) return { result: 'error' };

    const { code } = result.error;
    if (code === 'wrong-current-password') return { result: 'wrong-current' };
    // The session refusals reach a redirect, not this form.
    if (code === 'not-authenticated' || code === 'insufficient-role') {
      return { result: 'error' };
    }
    return { result: 'rejected', code };
  }

  /**
   * Clears the session. The local state is dropped even if the call fails —
   * the cookie may well be gone already (expired, or cleared server-side), and
   * leaving a stale "signed in" chrome behind would be the worse outcome.
   */
  async logout(): Promise<void> {
    try {
      await this.client.logout();
    } finally {
      this.session.set(null);
      this.dropPrePaintHint();
    }
  }

  /**
   * Re-read the identity from the server. Called at app start, and again
   * whenever something changes what the session *says* rather than who it is —
   * an account holder editing their own first name changes the greeting, and
   * the response to that edit is a profile, not an identity.
   */
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

  /**
   * Takes the pre-paint script's class off `<html>`, which hands the account
   * control back to Angular's own state (see `session-shell.server.ts`).
   *
   * It matters in exactly one case: a hint left over from a session that was
   * ended elsewhere. Without this the stylesheet would keep drawing the label
   * the hint asked for, over the answer the API just gave.
   */
  private dropPrePaintHint(): void {
    if (!this.isBrowser) return;
    this.document.documentElement.classList.remove(
      'session-known',
      'session-anonymous',
    );
  }
}
