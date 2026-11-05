import { Inject, Injectable } from '@nestjs/common';
import {
  CheckedConsent,
  ConsentService,
} from '../../core/site/consent.service';
import { DRIZZLE } from '../../platform/db/database.module';
import { UserRow, UsersService } from '../../core/accounts/users.service';
import { PasswordPolicy } from '../../core/accounts/password-policy';
import { PasswordTokenService } from '../../core/accounts/password-token.service';
import { PasswordService } from '../../core/accounts/password.service';
import { UserRole } from '@b2b-catalog-platform/shared/platform';
import { PasswordTokenPurpose } from '@b2b-catalog-platform/shared/storefront/accounts';
import { Database } from '../../platform/db/database';

/**
 * Redeeming a set-a-password link, invitation or reset. The link is the whole
 * credential, so unknown, used and expired are one answer: a guessed token
 * learns nothing.
 */
@Injectable()
export class PasswordSetupService {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: PasswordTokenService,
    private readonly passwords: PasswordService,
    private readonly policy: PasswordPolicy,
    private readonly consents: ConsentService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /** What the form needs first. The purpose comes from the account's status;
   * the role lets the caller turn a customer away from a closed shop. */
  async describe(token: string): Promise<{
    purpose: PasswordTokenPurpose;
    email: string;
    role: UserRole;
    consentRequired: boolean;
  } | null> {
    const userId = await this.tokens.userIdFor(token);
    if (!userId) return null;

    const user = await this.users.findById(userId);
    if (!user || user.status === 'anonymized') return null;

    return {
      purpose: user.status === 'invited' ? 'set' : 'reset',
      email: user.email,
      role: user.role,
      consentRequired: await this.owesConsent(user),
    };
  }

  /** The account consent (NFR-LEGAL-09), at a staff-made customer's first
   * password. A registrant gave it on the form. */
  private async owesConsent(user: UserRow): Promise<boolean> {
    return (
      user.status === 'invited' &&
      user.role === 'user' &&
      this.consents.isAsked('account') &&
      !(await this.consents.hasGiven(user.id, 'account'))
    );
  }

  /** Every check runs before the link is spent, so a refusal leaves it
   * usable. */
  async redeem(
    token: string,
    password: string,
    consentVersion?: number,
  ): Promise<UserRow | null> {
    const userId = await this.tokens.userIdFor(token);
    if (!userId) return null;

    const user = await this.users.findById(userId);
    if (!user || user.status === 'anonymized') return null;

    this.policy.assertAcceptable(password, user.email);

    let consent: CheckedConsent | null = null;
    if (await this.owesConsent(user)) {
      consent = await this.consents.check('account', consentVersion);
    }

    // The likeliest step to fail, so before the link is spent.
    const passwordHash = await this.passwords.hash(password);

    // One transaction: an active account without its consent record would
    // never be asked again.
    return this.db.transaction(async (tx) => {
      if (!(await this.tokens.redeem(token, tx))) return null;

      const updated = await this.users.setPasswordFromToken(
        userId,
        passwordHash,
        tx,
      );
      if (updated && consent) {
        await this.consents.record(
          consent,
          { userId, email: updated.email },
          tx,
        );
      }
      return updated ?? null;
    });
  }
}
