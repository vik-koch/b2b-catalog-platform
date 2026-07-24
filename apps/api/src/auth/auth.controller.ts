import { Controller, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { authContract, AuthUser } from '@b2b-catalog-platform/shared';
import { AuthThrottle } from '../throttling/throttle-presets';
import { AUTH_COOKIE } from './auth.constants';
import { Auth } from './auth.decorator';
import { CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';

// Matches the JWT expiry (7d) so the browser drops the cookie around the time
// the token stops verifying.
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @AuthThrottle()
  @TsRestHandler(authContract.login)
  login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return tsRestHandler(authContract.login, async ({ body }) => {
      const user = await this.auth.validate(body.email, body.password);
      if (!user) {
        // One message for unknown email and wrong password alike — don't reveal
        // which emails exist (the service also equalizes timing).
        return { status: 401, body: { message: 'Invalid email or password' } };
      }
      const token = await this.auth.signToken(user);
      res.cookie(AUTH_COOKIE, token, this.sessionCookie(req));
      return { status: 200, body: this.auth.toAuthUser(user) };
    });
  }

  @TsRestHandler(authContract.logout)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return tsRestHandler(authContract.logout, async () => {
      // Same attributes (minus maxAge) so the browser matches and clears it.
      res.clearCookie(AUTH_COOKIE, this.cookieAttributes(req));
      return { status: 200, body: { message: 'Logged out' } };
    });
  }

  @Auth()
  @TsRestHandler(authContract.me)
  me(@CurrentUser() user: AuthUser) {
    return tsRestHandler(authContract.me, async () => {
      return { status: 200, body: user };
    });
  }

  @Auth()
  @TsRestHandler(authContract.changePassword)
  changePassword(@CurrentUser() user: AuthUser) {
    return tsRestHandler(authContract.changePassword, async ({ body }) => {
      await this.auth.changePassword(
        user.id,
        body.currentPassword,
        body.newPassword,
      );
      return { status: 200, body: { message: 'Password changed' } };
    });
  }

  // httpOnly: never readable by page JS. secure: HTTPS-only, derived from
  // req.secure — true behind Traefik's TLS (trust proxy set), false for the
  // plain-HTTP dev/e2e server, so the cookie is usable in both. sameSite lax:
  // sent on top-level navigations (SSR sees it) but not on cross-site POSTs,
  // which blocks CSRF against the mutating endpoints.
  private cookieAttributes(req: Request) {
    return {
      httpOnly: true,
      secure: req.secure,
      sameSite: 'lax' as const,
      path: '/',
    };
  }

  private sessionCookie(req: Request) {
    return { ...this.cookieAttributes(req), maxAge: SESSION_MAX_AGE_MS };
  }
}
