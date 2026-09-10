import { createHash, randomBytes } from 'node:crypto';
import {
  API_TOKEN_PREFIX_LENGTH,
  API_TOKEN_SECRET_BYTES,
} from '@b2b-catalog-platform/shared';

/**
 * A token value is `<prefix>.<secret>`: a short clear head kept in the row so a
 * listed token is recognisable, and the randomness that makes it a credential.
 * The whole string is hashed — the prefix is not a lookup key, it is a label,
 * and treating it as one would make two tokens that happen to share a head
 * ambiguous.
 */
export interface GeneratedToken {
  value: string;
  prefix: string;
  hash: string;
}

/** base64url of random bytes: URL- and header-safe, and no padding to trim. */
export function generateToken(): GeneratedToken {
  const prefix = randomBytes(API_TOKEN_PREFIX_LENGTH)
    .toString('base64url')
    .slice(0, API_TOKEN_PREFIX_LENGTH);
  const secret = randomBytes(API_TOKEN_SECRET_BYTES).toString('base64url');
  const value = `${prefix}.${secret}`;
  return { value, prefix, hash: hashToken(value) };
}

/**
 * SHA-256, hex. Deterministic on purpose: the presented value has to find its
 * own row, and 256 bits of randomness needs no slow KDF to resist guessing —
 * the same reasoning `password_tokens` is stored under.
 */
export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Reads the credential out of an `Authorization` header. Bearer only, and the
 * scheme is compared case-insensitively because clients disagree about its
 * casing; the value itself is taken verbatim.
 */
export function bearerToken(
  header: string | string[] | undefined,
): string | null {
  if (typeof header !== 'string') return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  const value = rest.join(' ');
  return value.length > 0 ? value : null;
}
