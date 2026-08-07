import { Injectable } from '@nestjs/common';
import { PasswordTokenPurpose } from '@b2b-catalog-platform/shared';
import { UserRow, UsersService } from '../users/users.service';
import { PasswordPolicy } from './password-policy';
import { PasswordTokenService } from './password-token.service';
import { PasswordService } from './password.service';

/**
 * Redeeming a set-a-password link — the invitation staff send, and the reset a
 * visitor asks for.
 *
 * The link is the whole credential: it went to an address only that account's
 * owner reads, it is single-use and it expires. So nothing else is asked for,
 * and the three ways a link can be no good — unknown, already used, expired —
 * are one indistinguishable answer, or a guessed token would learn from the
 * difference.
 */
@Injectable()
export class PasswordSetupService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: PasswordTokenService,
    private readonly passwords: PasswordService,
    private readonly policy: PasswordPolicy,
  ) {}

  /**
   * What the form needs before it renders: which account, and whether this is
   * a first password or a replacement — derived from the account's status, not
   * from anything stored on the token.
   */
  async describe(
    token: string,
  ): Promise<{ purpose: PasswordTokenPurpose; email: string } | null> {
    const userId = await this.tokens.userIdFor(token);
    if (!userId) return null;

    const user = await this.users.findById(userId);
    if (!user || user.status === 'anonymized') return null;

    return {
      purpose: user.status === 'invited' ? 'set' : 'reset',
      email: user.email,
    };
  }

  /**
   * Spend the link and set the password. The policy check runs *after*
   * redemption would be wrong — a refused password would burn the link — so it
   * runs first, on the account the token names.
   */
  async redeem(token: string, password: string): Promise<UserRow | null> {
    const userId = await this.tokens.userIdFor(token);
    if (!userId) return null;

    const user = await this.users.findById(userId);
    if (!user || user.status === 'anonymized') return null;

    // Throws a 400 the form shows verbatim; the link stays usable, so the
    // visitor can simply try a different password.
    this.policy.assertAcceptable(password, user.email);

    // Only now is the link spent, and only if it is still unspent — the update
    // is conditional, so two simultaneous submissions cannot both win.
    if (!(await this.tokens.redeem(token))) return null;

    const passwordHash = await this.passwords.hash(password);
    const updated = await this.users.setPasswordFromToken(userId, passwordHash);
    return updated ?? null;
  }
}
