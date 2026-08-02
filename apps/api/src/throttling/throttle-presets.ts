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
 * Public, unauthenticated form posts. Generous enough that no human hits it,
 * low enough that a single IP cannot flood the shop with spam.
 * Numbers should be tuned here globally.
 */
export const PublicFormThrottle = () =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({ default: { limit: 10, ttl: seconds(60) } }),
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
