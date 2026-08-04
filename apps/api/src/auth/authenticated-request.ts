import type { Request } from 'express';
import { AuthUser } from '@b2b-catalog-platform/shared';

/**
 * An Express request after JwtAuthGuard has run: `user` is populated from the
 * verified session token. Optional because the guard may not have run (public
 * routes) — downstream code that requires it should assert its presence.
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  /**
   * The caller's pricing tier, set by OptionalAuthGuard on public routes; null
   * means the default list. Deliberately kept off `AuthUser`: a customer's tier
   * is staff-facing data and must never be serialized to them, and `AuthUser`
   * is exactly what `/auth/me` returns.
   */
  pricingTierId?: string | null;
}
