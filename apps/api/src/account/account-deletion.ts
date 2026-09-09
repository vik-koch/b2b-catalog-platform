import { Inject, Injectable, Logger } from '@nestjs/common';
import { PasswordTokenService } from '../auth/password-token.service';
import { PasswordService } from '../auth/password.service';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { MailService } from '../mail/mail.service';
import { accountClosedMail } from '../mail/templates/account-closed.template';
import { accountDeletedMail } from '../mail/templates/account-deleted.template';
import { OrderDocumentFiles } from '../orders/order-document-files';
import { UsersService } from '../users/users.service';
import { env } from '../env';

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
    private readonly orderDocuments: OrderDocumentFiles,
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

    // Read everything the two mails quote *before* the write, which is what
    // overwrites it. Sending before the write would be the other way to have
    // it, but then a failed write leaves somebody holding a confirmation of a
    // deletion that did not happen.
    const address = user.email;
    const closed = {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      orders: await this.users.countOrders(userId),
      openOrders: await this.users.countOpenOrders(userId),
    };

    await this.users.anonymize(userId, await this.passwords.unusableHash());
    // Outside the scrub's transaction on purpose: it deletes files as well as
    // rows, and a filesystem cannot be rolled back with a database. Run after,
    // so a failure here leaves documents belonging to an account that is
    // already gone rather than an account still readable with its documents
    // deleted.
    const removed = await this.orderDocuments.removeForUser(userId);
    if (removed > 0) {
      this.logger.log(`Removed ${removed} supplied order document(s)`);
    }
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

    // And the shop is told (FR-NOTIF-08). Separately, so one failing inbox does
    // not swallow the other message — and after the customer's, because theirs
    // is the one they are waiting on the page for.
    try {
      const staffInbox = env.MAIL_STAFF_TO;
      if (!staffInbox) {
        // env.ts requires this in server mode; this narrows the type.
        throw new Error('MAIL_STAFF_TO is not configured');
      }
      await this.mail.send(accountClosedMail(closed, this.text), {
        to: staffInbox,
      });
    } catch (error) {
      this.logger.error(
        `Could not send the staff closure notification: ${String(error)}`,
      );
    }

    return { ok: true };
  }
}
