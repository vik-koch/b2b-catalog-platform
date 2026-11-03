import { UserRole } from '@b2b-catalog-platform/shared/platform';

/**
 * The session token's claims. Role and email ride along for logs and the
 * client; every check reads them from the row instead (see `Sessions.read`).
 */
export interface JwtPayload {
  /** The account id. */
  sub: string;
  email: string;
  role: UserRole;
  /** The row's `tokenVersion` at issue: moving it ends the session. */
  tokenVersion: number;
  /** Seconds, set by the signer; a session in use renews once it is a day old. */
  iat?: number;
}
