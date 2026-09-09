import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { CreateUserRequest, StaffUser } from '@b2b-catalog-platform/shared';
import {
  INVITE_TTL_MS,
  PasswordTokenService,
} from '../auth/password-token.service';
import { PasswordService } from '../auth/password.service';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { MailService } from '../mail/mail.service';
import {
  InvitationKind,
  invitationMail,
} from '../mail/templates/invitation.template';
import { PasswordResetService } from '../auth/password-reset.service';
import { StaffUsersService } from './staff-users.service';

/**
 * Turning a decision into a usable account: mint a single-use link and mail it.
 */
@Injectable()
export class AccountInvitations {
  private readonly logger = new Logger('Invitations');

  constructor(
    private readonly users: StaffUsersService,
    private readonly tokens: PasswordTokenService,
    private readonly passwords: PasswordService,
    private readonly reset: PasswordResetService,
    private readonly mail: MailService,
    @Inject(MAIL_TEXT) private readonly text: MailText,
  ) {}

  /** Create a staff-made account, already invited. */
  async create(
    input: CreateUserRequest,
    createdBy: string,
  ): Promise<StaffUser> {
    const placeholder = await this.passwords.unusableHash();
    const user = await this.users.create(input, createdBy, placeholder);
    await this.send(user, 'created');
    return user;
  }

  /**
   * Send the way in again — the mail was lost, filed as spam, or its deadline
   * ran out; or somebody is locked out and rang the shop instead of using the
   * form. Issuing a new token revokes the outstanding one, so there is never
   * more than one live link.
   *
   * Which mail goes is the account's own status, decided in one place for
   * staff and for the login form alike (`PasswordResetService.sendLink`). What
   * is refused here is an account with no sign-in to restore: a registration
   * nobody has decided on, one switched off on purpose — switch it back on
   * first — and a tombstone.
   */
  async sendPasswordLink(user: StaffUser): Promise<void> {
    if (user.status !== 'invited' && user.status !== 'active') {
      throw new ConflictException({
        code: 'account-cannot-sign-in',
        message: 'Only an account that may sign in can be sent a link',
      });
    }
    await this.reset.sendLink(user);
  }

  /**
   * Switch an account off. The status write ends every session in flight; this
   * adds the other way in — a set-your-password link sitting unused in a
   * mailbox, which would otherwise be a working key to an account nobody may
   * sign into any more.
   *
   * The password itself stays (see StaffUsersService.deactivate), so switching
   * an account back on needs no mail and tells its owner nothing.
   */
  async deactivate(id: string, actorId: string): Promise<StaffUser> {
    const updated = await this.users.deactivate(id, actorId);
    await this.tokens.revokeOutstanding(id);
    return updated;
  }

  /**
   * Mail the link. Deliberately not allowed to fail the request that caused it:
   * the account decision is already recorded, and staff can re-send from the
   * account list. Losing the approval because SMTP hiccuped would be worse.
   */
  async send(user: StaffUser, kind: InvitationKind): Promise<void> {
    try {
      const token = await this.tokens.issue(user.id, INVITE_TTL_MS);
      await this.mail.send(invitationMail(token, this.text, kind), {
        to: user.email,
      });
    } catch (error) {
      this.logger.error(`Could not send the invitation to ${user.id}`, error);
    }
  }
}
