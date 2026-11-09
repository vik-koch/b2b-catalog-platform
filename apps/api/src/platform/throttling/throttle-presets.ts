/** Named per-route limits, each keyed on the client IP (`TRUST_PROXY_HOPS`). */
import { applyDecorators, UseGuards } from '@nestjs/common';
import { seconds, Throttle, ThrottlerGuard } from '@nestjs/throttler';

import { env } from '../env';

const perMinute = (limit: number) =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({ default: { limit, ttl: seconds(60) } }),
  );

/** The public forms: inquiry (FR-NAV-06) and registration (FR-AUTH-01). */
export const PublicFormThrottle = () => perMinute(env.PUBLIC_FORM_RATE_LIMIT);

/** Product search, the one public route that runs a typed expression against
 * the catalog. */
export const SearchThrottle = () => perMinute(60);

/** Search suggestions (FR-SEARCH-05): several calls per query as the visitor
 * types, each cheaper than a search. */
export const SuggestionThrottle = () => perMinute(180);

/** The suggestion sidecar's addresses and companies (NFR-SEC-08): a metered
 * third party, so the limit is a billing control too. */
export const SidecarSuggestionThrottle = () => perMinute(60);

/** Sign-in, against credential stuffing (NFR-SEC-02). */
export const AuthThrottle = () => perMinute(env.AUTH_RATE_LIMIT);

/** The call screen asks every few seconds while the person dials (FR-AUTH-12),
 * which the sign-in limit would cut off. */
export const SignInCallThrottle = () => perMinute(60);

/** A mailed order link, whose token is the only credential (NFR-SEC-06): no
 * honest caller reads it in a loop. */
export const OrderTokenThrottle = () => perMinute(30);

/** Machine routes (NFR-SEC-09), a bucket of their own so an integration and
 * the shop's visitors cannot exhaust each other's limit. */
export const MachineThrottle = () => perMinute(60);
