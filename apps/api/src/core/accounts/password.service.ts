import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './password-hashing';

/** The argon2id helpers, injectable. */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hashPassword(plain);
  }

  verify(hashString: string, plain: string): Promise<boolean> {
    return verifyPassword(hashString, plain);
  }

  /** The stand-in until an owner chooses a password: a real hash of a secret
   * nobody holds, since a sentinel would make argon2 throw at sign-in. */
  unusableHash(): Promise<string> {
    return this.hash(randomBytes(32).toString('hex'));
  }
}
