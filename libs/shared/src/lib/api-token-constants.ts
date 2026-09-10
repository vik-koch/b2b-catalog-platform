/**
 * Machine-token limits and vocabulary (NFR-SEC-09). Import-free so a component
 * showing a name's character counter does not pull Zod into the browser.
 */

/** How long a token's own name may be — an operator's label, not an identifier. */
export const API_TOKEN_NAME_MAX_LENGTH = 80;

/**
 * What a token may do, named by capability rather than by route: a handler asks
 * for the scope it needs, and adding an endpoint to an existing capability
 * changes no token row. A closed set in code, because a scope is a security
 * boundary rather than deployment data — a new one is a release.
 *
 * A token carries a **set** of these, not one. The automated client a
 * deployment runs is usually a single process doing several things — receiving
 * a catalog and handing back orders — and splitting that across two
 * credentials buys the platform a simpler column at the operator's expense:
 * two secrets in one config file, two rotations, and two chances to put the
 * wrong one in the wrong slot. Least privilege is kept by which capabilities
 * an operator ticks, not by how many rows they have to manage.
 */
export const API_TOKEN_SCOPES = ['catalog-sync'] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

/**
 * The clear head of a token value, kept in the row so a listed token is
 * recognisable when its value is not. Long enough to identify, far too short
 * to guess the rest from.
 */
export const API_TOKEN_PREFIX_LENGTH = 8;

/** Bytes of randomness behind the prefix. */
export const API_TOKEN_SECRET_BYTES = 32;

/** The header a machine client presents it in — never a cookie, never a URL. */
export const API_TOKEN_SCHEME = 'Bearer';
