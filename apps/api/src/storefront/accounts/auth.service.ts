import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRow, UsersService } from '../../core/accounts/users.service';
import { PasswordPolicy } from '../../core/accounts/password-policy';
import { PasswordRejectedError } from '../../core/accounts/password-rejected-error';
import { PasswordService } from '../../core/accounts/password.service';
import { WrongCurrentPasswordError } from './wrong-current-password-error';

/** Checking a password, and changing it. */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly policy: PasswordPolicy,
  ) {}

  /**
   * The account, or null. A hash is verified even for an unknown address, so
   * the clock does not tell which addresses exist; an account that is not
   * `active` fails the same way, for the same reason.
   */
  async validate(email: string, password: string): Promise<UserRow | null> {
    const user = await this.users.findByEmail(email);
    const hash = user?.passwordHash ?? (await this.timingDummyHash());
    const ok = await this.passwords.verify(hash, password);
    if (!ok || !user || user.status !== 'active') return null;
    return user;
  }

  /** Answers the row: the change ends every session, the caller's too, so
   * the controller reissues its cookie from it. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<UserRow> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        code: 'not-authenticated',
        message: 'Not authenticated',
      });
    }
    const ok = await this.passwords.verify(user.passwordHash, currentPassword);
    if (!ok) {
      throw new WrongCurrentPasswordError();
    }
    // The forced first change (FR-AUTH-08) must not keep the handed-out one.
    if (newPassword === currentPassword) {
      throw new PasswordRejectedError(
        'password-unchanged',
        'New password is the same as the current one',
      );
    }
    this.policy.assertAcceptable(newPassword, user.email);
    const passwordHash = await this.passwords.hash(newPassword);
    return this.users.setPassword(userId, passwordHash);
  }

  /** Hashed once, for an unknown address to verify against. */
  private dummyHash?: Promise<string>;
  private timingDummyHash(): Promise<string> {
    return (this.dummyHash ??= this.passwords.hash('timing-equalizer'));
  }
}
