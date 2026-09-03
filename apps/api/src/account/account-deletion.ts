import { Inject, Injectable, Logger } from '@nestjs/common';
import { PasswordTokenService } from '../auth/password-token.service';
import { PasswordService } from '../auth/password.service';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { MailService } from '../mail/mail.service';
import { accountDeletedMail } from '../mail/templates/account-deleted.template';
import { UsersService } from '../users/users.service';

/** Why a deletion was refused, when it was. */
export type DeleteAccountResult =
  { ok: true } | { ok: false; reason: 'wrong-password' | 'last-admin' };

/**
 * Deleting your own account (FR-AUTH-06). Anonymization, not a DELETE — the
 * reasoning is in ADR 0032; what this class owns is the order the steps happen
 * in, because two of them cannot be reordered without breaking.
 */
@Injectable()
export class AccountDeletion {
  private readonly logger = new Logger('AccountDeletion');

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: PasswordTokenService,
    private readonly mail: MailService,
    @Inject(MAIL_TEXT) private readonly text: MailText,
  ) {}

  async delete(userId: string, password: string): Promise<DeleteAccountResult> {
    const user = await this.users.findById(userId);
    // The guard read this row a moment ago; if it is gone the session is, so
    // answering "wrong password" is both true enough and the safe direction.
    if (!user) return { ok: false, reason: 'wrong-password' };

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      return { ok: false, reason: 'wrong-password' };
    }

    // Staff may leave like anyone else, but not the last one who can let people
    // back in — the same rule that guards a role change and a deactivation.
    if (user.role === 'admin' && !(await this.users.hasAnotherAdmin(userId))) {
      return { ok: false, reason: 'last-admin' };
    }

    // Read the address *before* the write, which is what overwrites it. Sending
    // before the write would be the other way to have one, but then a failed
    // write leaves somebody holding a confirmation of a deletion that did not
    // happen.
    const address = user.email;

    await this.users.anonymize(userId, await this.passwords.unusableHash());
    // Any set-a-password link still out would otherwise be a way back into a
    // tombstone.
    await this.tokens.revokeOutstanding(userId);

    // The deletion is the request, not the mail — unlike an invitation, where
    // the mail *is* the point. A mail that will not send is logged and the
    // account stays deleted.
    try {
      await this.mail.send(accountDeletedMail(this.text), { to: address });
    } catch (error) {
      this.logger.error(
        `Could not send the deletion confirmation: ${String(error)}`,
      );
    }

    return { ok: true };
  }
}
