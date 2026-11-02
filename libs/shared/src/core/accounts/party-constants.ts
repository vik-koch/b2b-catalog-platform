/**
 * What a party lookup may ask for. Plain data with no imports, so the
 * checkout’s suggest field does not pull the party schema — and Zod — along
 * with its minimum (see `auth-constants.ts` for why).
 */

/**
 * NFR-SEC-08: metered, so the query is bounded at both ends — two letters match
 * half a register and would be a paid call that cannot mean anything.
 */
export const PARTY_QUERY_MIN_LENGTH = 3;

/**
 * Company suggestion (FR-AUTH-09, ADR 0041). The twin of the address
 * suggestion, and deliberately its own contract: a company and an address are
 * different subjects, answered by different endpoints of the same sidecar, and
 * a deployment may have one without the other.
 */

export const PARTY_QUERY_MAX_LENGTH = 120;

export const PARTY_SUGGESTION_LIMIT = 8;
