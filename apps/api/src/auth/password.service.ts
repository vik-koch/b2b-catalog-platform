import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with argon2id — a deliberately slow, memory-hard, one-way
 * function. The raw password is never stored; only the returned self-contained
 * string (algorithm + parameters + random salt + digest) goes to the database,
 * and there is no key involved, so nothing hashing-related lives in the app's
 * secrets. See docs/adr for the rationale.
 */
@Injectable()
export class PasswordService {
  // Cost parameters are pinned here (not left to library defaults) so they are
  // explicit and reviewable. OWASP baseline for argon2id: 64 MiB, 3 iterations,
  // 1 lane. They are stored inside every hash, so raising them later only
  // affects newly created hashes — existing ones keep verifying unchanged.
  private readonly options = {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  };

  hash(plain: string): Promise<string> {
    return hash(plain, this.options);
  }

  verify(hashString: string, plain: string): Promise<boolean> {
    // Resolves false on a wrong password; it only rejects if `hashString` is
    // malformed, which would be a stored-data bug rather than a failed login.
    return verify(hashString, plain);
  }
}
