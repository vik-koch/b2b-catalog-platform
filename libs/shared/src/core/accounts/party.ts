/**
 * What a company lookup (FR-AUTH-09) may ask for. Plain data with no imports,
 * so the suggest field does not pull Zod along with its minimum.
 */

/** Metered (NFR-SEC-08), so the query is bounded at both ends: two letters
 * match half a register. */
export const PARTY_QUERY_MIN_LENGTH = 3;

export const PARTY_QUERY_MAX_LENGTH = 120;

export const PARTY_SUGGESTION_LIMIT = 8;
