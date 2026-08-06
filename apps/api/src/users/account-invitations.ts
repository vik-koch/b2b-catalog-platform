import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateUserRequest, StaffUser } from '@b2b-catalog-platform/shared';
import {
  INVITE_TTL_MS,
  PasswordTokenService,
} from '../auth/password-token.service';
import { PasswordService } from '../auth/password.service';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { MailService } from '../mail/mail.service';
import { invitationMail } from '../mail/templates/invitation.template';
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
   * Mail the link. Deliberately not allowed to fail the request that caused it:
   * the account decision is already recorded, and staff can re-send from the
   * account list. Losing the approval because SMTP hiccuped would be worse.
   */
  async send(user: StaffUser, kind: 'approved' | 'created'): Promise<void> {
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
