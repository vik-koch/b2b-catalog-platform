import { Inject, Injectable, Logger } from '@nestjs/common';
import { PasswordTokenService } from './password-token.service';
import { PasswordService } from './password.service';
import { MAIL_TEXT, MailText } from '../../mail/mail-text';
import { SHARED_TEXT } from '../../config/shared-text';
import { MailDispatcher } from '../../mail/mail-dispatcher';
import {
  accountClosedMail,
  ClosedAccountSummary,
} from '../../mail/templates/account-closed.template';
import { accountDeletedMail } from '../../mail/templates/account-deleted.template';
import { SharedText } from '@b2b-catalog-platform/shared';
import { ACCOUNT_ORDERS, AccountOrders } from './account-orders';
import { AccountErasure } from './account-erasure';
import { UserRow, UsersService } from './users.service';
import { LastAdminError } from './last-admin-error';
import { env } from '../../env';
import { AccountDeletionReason } from '@b2b-catalog-platform/shared/core/accounts';

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

/** Deleting your own account (FR-AUTH-06), or an admin deleting it on your
 * request (FR-ADM-23): the order of the steps around the anonymization. */
@Injectable()
export class AccountDeletion {
  private readonly logger = new Logger('AccountDeletion');

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly tokens: PasswordTokenService,
    private readonly mail: MailDispatcher,
    private readonly erasure: AccountErasure,
    @Inject(ACCOUNT_ORDERS) private readonly orders: AccountOrders,
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(SHARED_TEXT) private readonly common: SharedText,
  ) {}

  async delete(userId: string, password: string): Promise<DeleteAccountResult> {
    const user = await this.users.findById(userId);
    // Gone since the guard read it: the safe answer.
    if (!user) return { ok: false, reason: 'wrong-password' };

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      return { ok: false, reason: 'wrong-password' };
    }

    const closed = await this.closedSummary(user);
    const result = await this.close(user, { reason: 'request' });
    if (!result.ok) return result;

    // The shop is told (FR-NOTIF-08), after the customer's mail.
    const staffInbox = env.MAIL_STAFF_TO;
    if (!staffInbox) {
      // env.ts requires this in server mode; this narrows the type.
      this.logger.error('MAIL_STAFF_TO is not configured');
    } else {
      await this.mail.dispatch(
        accountClosedMail(closed, this.text, this.common),
        { to: staffInbox },
        'staff closure notification',
      );
    }

    return { ok: true };
  }

  /** No password, and no mail to the shop: the shop did it, and the closure
   * notice says a customer did. */
  async deleteOnRequest(
    userId: string,
    admin: { readonly id: string; readonly email: string },
    reason: AccountDeletionReason,
  ): Promise<DeleteOnRequestResult> {
    const user = await this.users.findById(userId);
    if (!user) return { ok: false, reason: 'not-found' };
    if (user.id === admin.id) return { ok: false, reason: 'self-delete' };
    if (user.status === 'anonymized') return { ok: false, reason: 'closed' };
    // Declining is the door for a registration (FR-AUTH-11).
    if (user.status === 'pending') return { ok: false, reason: 'pending' };
    return this.close(user, { reason, by: admin });
  }

  /** The steps both doors share. */
  private async close(
    user: UserRow,
    deletion: Parameters<UsersService['anonymize']>[2],
  ): Promise<{ ok: true } | { ok: false; reason: 'last-admin' }> {
    // Read before the write overwrites it; mailed after, so a failed write
    // confirms nothing.
    const address = user.email;

    try {
      await this.users.anonymize(
        user.id,
        await this.passwords.unusableHash(),
        deletion,
      );
    } catch (error) {
      if (error instanceof LastAdminError) {
        return { ok: false, reason: 'last-admin' };
      }
      throw error;
    }
    // Files cannot roll back with the database, so after the commit: a
    // failure leaves stray files, not a live account without its files.
    await this.erasure.afterCommit({
      userId: user.id,
      kind: 'account',
      reason: deletion.reason,
      by: deletion.by ?? { id: user.id },
    });
    // A link still out would be a way back into the tombstone.
    await this.tokens.revokeOutstanding(user.id);

    await this.mail.dispatch(
      accountDeletedMail(this.text),
      { to: address },
      'deletion confirmation',
    );
    return { ok: true };
  }

  /** What the shop's notification quotes, read before the erasure. */
  private async closedSummary(user: UserRow): Promise<ClosedAccountSummary> {
    const [orders, openOrders] = await Promise.all([
      this.orders.count(user.id),
      this.orders.countOpen(user.id),
    ]);
    return {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      orders,
      openOrders,
    };
  }
}
