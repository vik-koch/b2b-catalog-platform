import { hash, verify } from '@node-rs/argon2';

/**
 * The OWASP argon2id baseline, shared with the bootstrap-admin one-shot,
 * which hashes outside Nest. Each hash stores its parameters, so raising
 * them later leaves existing hashes verifying.
 */
export const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

export function verifyPassword(
  hashString: string,
  plain: string,
): Promise<boolean> {
  // Rejects only on a malformed hash: corrupt data, not a failed login.
  return verify(hashString, plain);
}
