/**
 * Name of the httpOnly session cookie carrying the signed JWT. The guard reads
 * it; the controller (login/logout) sets and clears it. It is defined in the
 * shared contract because the SSR tier looks for the same name (see the web
 * app's api-client.ts) — re-exported here so the API's own code keeps one
 * import and the two can never drift.
 */
export { AUTH_COOKIE } from '@b2b-catalog-platform/shared';
