import { Inject, Injectable, Logger } from '@nestjs/common';
import { PasswordTokenService } from '../auth/password-token.service';
import { PasswordService } from '../auth/password.service';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { MailDispatcher } from '../mail/mail-dispatcher';
import {
  accountClosedMail,
  ClosedAccountSummary,
} from '../mail/templates/account-closed.template';
import { accountDeletedMail } from '../mail/templates/account-deleted.template';
import { OrderDocumentFiles } from '../orders/order-document-files';
import { LastAdminError, UserRow, UsersService } from '../users/users.service';
import { env } from '../env';

/** Why a deletion was refused, when it was. */
export type DeleteAccountResult =
  { ok: true } | { ok: false; reason: 'wrong-password' | 'last-admin' };

/** The same, for a deletion an admin performs on the person's request. */
export type DeleteOnRequestResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not-found' | 'self-delete' | 'closed' | 'pending' | 'last-admin';
    };

/**
 * Deleting your own account (FR-AUTH-06), or an admin deleting it on your
 * request (FR-ADM-23). Anonymization, not a DELETE — the
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
    private readonly mail: MailDispatcher,
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

    const closed = await this.closedSummary(user);
    const result = await this.close(user);
    if (!result.ok) return result;

    // And the shop is told (FR-NOTIF-08). Separately, so one failing inbox does
    // not swallow the other message — and after the customer's, because theirs
    // is the one the queue should reach first.
    const staffInbox = env.MAIL_STAFF_TO;
    if (!staffInbox) {
      // env.ts requires this in server mode; this narrows the type.
      this.logger.error('MAIL_STAFF_TO is not configured');
    } else {
      await this.mail.dispatch(
        accountClosedMail(closed, this.text),
        { to: staffInbox },
        'staff closure notification',
      );
    }

    return { ok: true };
  }

  /**
   * The same deletion, done by an admin on the person's request (FR-ADM-23).
   * No password, since the person is not the one at the keyboard; the admin
   * is named on the consent withdrawals it writes. The shop is not mailed: it
   * is the shop that did it, and the closure notice says a customer did.
   */
  async deleteOnRequest(
    userId: string,
    admin: { readonly id: string; readonly email: string },
  ): Promise<DeleteOnRequestResult> {
    const user = await this.users.findById(userId);
    if (!user) return { ok: false, reason: 'not-found' };
    if (user.id === admin.id) return { ok: false, reason: 'self-delete' };
    if (user.status === 'anonymized') return { ok: false, reason: 'closed' };
    // Declining removes a registration outright (FR-AUTH-11), and writes its
    // own withdrawal: two doors to one outcome would record it two ways.
    if (user.status === 'pending') return { ok: false, reason: 'pending' };
    return this.close(user, admin);
  }

  /**
   * The steps both doors share, in the order that matters. Two of them cannot
   * be reordered without breaking.
   */
  private async close(
    user: UserRow,
    by?: { readonly id: string; readonly email: string },
  ): Promise<{ ok: true } | { ok: false; reason: 'last-admin' }> {
    // Read the address the mail goes to *before* the write, which is what
    // overwrites it. Sending before the write would be the other way to have
    // it, but then a failed write leaves somebody holding a confirmation of a
    // deletion that did not happen.
    const address = user.email;

    // Staff may leave like anyone else, but not the last one who can let people
    // back in — the same rule that guards a role change and a deactivation,
    // and raised from inside the scrub's own transaction so that two admins
    // leaving at once cannot both be the one who was allowed to.
    try {
      await this.users.anonymize(
        user.id,
        await this.passwords.unusableHash(),
        by,
      );
    } catch (error) {
      if (error instanceof LastAdminError) {
        return { ok: false, reason: 'last-admin' };
      }
      throw error;
    }
    // Outside the scrub's transaction on purpose: it deletes files as well as
    // rows, and a filesystem cannot be rolled back with a database. Run after,
    // so a failure here leaves documents belonging to an account that is
    // already gone rather than an account still readable with its documents
    // deleted.
    const removed = await this.orderDocuments.removeForUser(user.id);
    if (removed > 0) {
      this.logger.log(`Removed ${removed} supplied order document(s)`);
    }
    // Any set-a-password link still out would otherwise be a way back into a
    // tombstone.
    await this.tokens.revokeOutstanding(user.id);

    // The deletion is the request, not the mail — unlike an invitation, where
    // the mail *is* the point. A mail that will not send is logged and the
    // account stays deleted, and nobody watches a spinner while it goes.
    await this.mail.dispatch(
      accountDeletedMail(this.text),
      { to: address },
      'deletion confirmation',
    );
    return { ok: true };
  }

  /** What the shop's notification quotes, read before the scrub erases it. */
  private async closedSummary(user: UserRow): Promise<ClosedAccountSummary> {
    return {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      orders: await this.users.countOrders(user.id),
      openOrders: await this.users.countOpenOrders(user.id),
    };
  }
}
