import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { INVITE_TTL_MS, PasswordTokenService } from './password-token.service';
import { PasswordService } from './password.service';
import { MAIL_TEXT, MailText } from '../../mail/mail-text';
import { MailDispatcher } from '../../mail/mail-dispatcher';
import {
  InvitationKind,
  invitationMail,
} from '../../mail/templates/invitation.template';
import { PasswordResetService } from './password-reset.service';
import { StaffUsersService } from './staff-users.service';
import {
  CreateUserRequest,
  StaffUser,
} from '@b2b-catalog-platform/shared/core/accounts';

/** Turning a staff decision into a usable account: a link, mailed. */
@Injectable()
export class AccountInvitations {
  private readonly logger = new Logger('Invitations');

  constructor(
    private readonly users: StaffUsersService,
    private readonly tokens: PasswordTokenService,
    private readonly passwords: PasswordService,
    private readonly reset: PasswordResetService,
    private readonly mail: MailDispatcher,
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

  /** Send the way in again: the mail was lost, or the holder rang the shop.
   * Refused for an account with no sign-in to restore. */
  async sendPasswordLink(user: StaffUser): Promise<void> {
    if (user.status !== 'invited' && user.status !== 'active') {
      throw new ConflictException({
        code: 'account-cannot-sign-in',
        message: 'Only an account that may sign in can be sent a link',
      });
    }
    await this.reset.sendLink(user);
  }

  /** Switch an account off, and retire any link still out: an unused one
   * would be a key to it. */
  async deactivate(id: string, actorId: string): Promise<StaffUser> {
    const updated = await this.users.deactivate(id, actorId);
    await this.tokens.revokeOutstanding(id);
    return updated;
  }

  /**
   * Never fails the request that caused it: the decision is recorded, and
   * staff can resend. The token is minted here and only the mail is queued,
   * so the account screen shows the link at once.
   */
  async send(user: StaffUser, kind: InvitationKind): Promise<void> {
    try {
      const token = await this.tokens.issue(user.id, INVITE_TTL_MS);
      await this.mail.dispatch(
        invitationMail(token, this.text, kind),
        { to: user.email },
        `invitation to ${user.id}`,
      );
    } catch (error) {
      this.logger.error(`Could not send the invitation to ${user.id}`, error);
    }
  }
}
