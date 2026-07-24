import { Request } from 'express';
import { AuthUser } from '@b2b-catalog-platform/shared';

/**
 * An Express request after JwtAuthGuard has run: `user` is populated from the
 * verified session token. Optional because the guard may not have run (public
 * routes) — downstream code that requires it should assert its presence.
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
