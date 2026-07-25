import { Injectable } from '@nestjs/common';
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
}
