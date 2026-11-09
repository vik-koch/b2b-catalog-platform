import { createHash, randomBytes } from 'node:crypto';

import {
  API_TOKEN_PREFIX_LENGTH,
  API_TOKEN_SECRET_BYTES,
} from '@b2b-catalog-platform/shared/platform';

/** `<prefix>.<secret>`, hashed whole: the prefix is a label, not a key, as two
 * tokens may share one. */
interface GeneratedToken {
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

/** Deterministic, so the presented value finds its row; 256 random bits need
 * no slow KDF. */
export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** The scheme is compared case-insensitively, as clients disagree on it; the
 * value is taken verbatim. */
export function bearerToken(
  header: string | string[] | undefined,
): string | null {
  if (typeof header !== 'string') return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
  const value = rest.join(' ');
  return value.length > 0 ? value : null;
}
