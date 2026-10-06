import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PasswordTokenPurpose, UserRole } from '@b2b-catalog-platform/shared';
import { CheckedConsent, ConsentService } from '../consents/consent.service';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
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
    private readonly consents: ConsentService,
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * What the form needs before it renders: which account, and whether this is
   * a first password or a replacement — derived from the account's status, not
   * from anything stored on the token. The role rides along for the caller,
   * which turns a customer away while the shop is closed.
   */
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

  /**
   * The account consent (NFR-LEGAL-09) is asked where a customer opened on
   * their behalf first acts on their own: the first password. A registrant
   * gave it on the form, so an approved registration is not asked twice.
   * Staff are not asked: theirs is not a customer account.
   */
  private async owesConsent(user: UserRow): Promise<boolean> {
    return (
      user.status === 'invited' &&
      user.role === 'user' &&
      this.consents.isAsked('account') &&
      !(await this.consents.hasGiven(user.id, 'account'))
    );
  }

  /**
   * Spend the link and set the password. The policy check runs *after*
   * redemption would be wrong — a refused password would burn the link — so it
   * runs first, on the account the token names.
   */
  async redeem(
    token: string,
    password: string,
    consentVersion?: number,
  ): Promise<UserRow | null> {
    const userId = await this.tokens.userIdFor(token);
    if (!userId) return null;

    const user = await this.users.findById(userId);
    if (!user || user.status === 'anonymized') return null;

    // Throws a 400 the form shows verbatim; the link stays usable, so the
    // visitor can simply try a different password.
    this.policy.assertAcceptable(password, user.email);

    // A refused consent leaves the link usable too.
    let consent: CheckedConsent | null = null;
    if (await this.owesConsent(user)) {
      consent = await this.consents.check('account', consentVersion);
    }

    // Hashing before the link is spent, not after: it is the slowest and
    // hungriest step here, and a failure in it would otherwise burn the link
    // without setting a password — leaving the visitor unable to re-request
    // one themselves.
    const passwordHash = await this.passwords.hash(password);

    // One transaction from here: a consent record that failed after the
    // account turned active would never be asked for again, and the visitor
    // would hold a spent link besides.
    return this.db.transaction(async (tx) => {
      // Only now is the link spent, and only if it is still unspent — the
      // update is conditional, so two simultaneous submissions cannot both win.
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
