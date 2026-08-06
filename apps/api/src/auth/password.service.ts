import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './password-hashing';

/**
 * Injectable wrapper over the shared argon2id helpers (see ./password-hashing).
 * The raw password is never stored — only the returned self-contained hash
 * string (algorithm + parameters + random salt + digest) goes to the database.
 */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hashPassword(plain);
  }

  verify(hashString: string, plain: string): Promise<boolean> {
    return verifyPassword(hashString, plain);
  }

  /**
   * The stand-in hash for an account created before its owner has chosen a
   * password — a pending registration or a staff-made account. A real argon2
   * hash of a random secret nobody holds, not a sentinel: argon2 throws on a
   * malformed hash string, so a placeholder would turn a login attempt on such
   * an account into a 500 instead of a clean failure.
   */
  unusableHash(): Promise<string> {
    return this.hash(randomBytes(32).toString('hex'));
  }
}
