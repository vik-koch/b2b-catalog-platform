import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id cost parameters — the single source of truth shared by the runtime
 * PasswordService and the bootstrap-admin one-shot, which hashes outside the
 * Nest DI container. OWASP baseline for argon2id: 64 MiB memory, 3 iterations,
 * 1 lane. The parameters are stored inside every hash, so raising them later
 * only affects newly created hashes; existing ones keep verifying unchanged.
 *
 * Hashing needs no secret: security comes from the function being one-way, slow,
 * and salted (a random salt is embedded in each hash), not from hiding anything.
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
  // Resolves false on a wrong password; rejects only if `hashString` is
  // malformed, which would be stored-data corruption, not a failed login.
  return verify(hashString, plain);
}
