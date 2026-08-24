import { applyDecorators, UseGuards } from '@nestjs/common';
import { seconds, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { env } from '../env';

/**
 * Reusable throttle presets. Applying one wires up the shared
 * `ThrottlerGuard` and a tuned per-route limit in a single decorator, so every
 * abuse-prone endpoint shares one named policy instead of scattering magic
 * numbers. Keys on the client IP (the proxy's forwarded address in prod — see
 * `TRUST_PROXY_HOPS` in main.ts).
 */

/**
 * Public, unauthenticated form posts — the inquiry form (FR-NAV-06) and
 * registration (FR-AUTH-01). Generous enough that no human hits it, low enough
 * that a single IP cannot flood the shop with spam or with pending accounts.
 *
 * The limit comes from the environment (default 10) for the same reason the
 * auth one does: the e2e suite drives every public-form path from a single
 * address inside one window, and a hardcoded ceiling would cap how many such
 * tests may ever exist. Deployments keep the default.
 */
export const PublicFormThrottle = () =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({
      default: { limit: env.PUBLIC_FORM_RATE_LIMIT, ttl: seconds(60) },
    }),
  );

/**
 * Product search: the only unauthenticated endpoint that runs a user-supplied
 * expression against the catalog, so it gets a ceiling of its own even though
 * the query itself is bounded and indexed. One a second over a minute is far
 * more than a person browsing produces, and still caps how fast a single
 * address can drive the matcher.
 */
export const SearchThrottle = () =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({ default: { limit: 60, ttl: seconds(60) } }),
  );

/**
 * Search suggestions (FR-SEARCH-05). Its own ceiling rather than the search
 * one: this endpoint is called while the visitor types, so several requests per
 * query is normal traffic and not a signal of abuse. The query is the cheaper
 * half of the matcher — no count, no offset, five rows — so a higher limit
 * costs less than the search page's does.
 */
export const SuggestionThrottle = () =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({ default: { limit: 180, ttl: seconds(60) } }),
  );

/**
 * Everything the deployment's suggestion sidecar answers — addresses and
 * companies alike (FR-CART-11, FR-AUTH-09, NFR-SEC-08). Tighter than the
 * catalog's own suggestions even though both fire while someone types: these
 * leave the deployment for a metered third party, so the ceiling is a billing
 * control as much as an abuse one. The browser debounces on top of it.
 */
export const SidecarSuggestionThrottle = () =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({ default: { limit: 60, ttl: seconds(60) } }),
  );

/**
 * Authentication endpoints (login). A handful of tries a minute per IP is
 * sufficient for a human and throttles credential-stuffing / brute force.
 * Traefik also rate-limits at the edge.
 *
 * The limit comes from the environment (default 10) so the e2e stack can lift
 * it: that suite signs in dozens of times from a single address inside one
 * window, and a hardcoded ceiling would cap how many auth tests may ever exist.
 */
export const AuthThrottle = () =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({ default: { limit: env.AUTH_RATE_LIMIT, ttl: seconds(60) } }),
  );
