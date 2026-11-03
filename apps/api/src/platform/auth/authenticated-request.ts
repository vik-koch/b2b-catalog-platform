import type { Request } from 'express';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

/** A request after a session guard ran; `user` is absent on a public route. */
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  /**
   * Set by OptionalAuthGuard; null is the default list. Kept off `AuthUser`,
   * which `/auth/me` returns: a customer never sees their own tier.
   */
  pricingTierId?: string | null;
}
