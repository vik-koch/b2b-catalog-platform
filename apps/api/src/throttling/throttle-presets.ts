import { applyDecorators, UseGuards } from '@nestjs/common';
import { seconds, Throttle, ThrottlerGuard } from '@nestjs/throttler';

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
 * Authentication endpoints (login). A handful of tries a minute per IP is
 * sufficient for a human and throttles credential-stuffing / brute force.
 * Traefik also rate-limits at the edge.
 */
export const AuthThrottle = () =>
  applyDecorators(
    UseGuards(ThrottlerGuard),
    Throttle({ default: { limit: 10, ttl: seconds(60) } }),
  );
