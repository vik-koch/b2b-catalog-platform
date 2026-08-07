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
import { StaffUsersService } from './staff-users.service';

/**
 * Which wording an account's own history calls for: one that was approved
 * asked for itself, one without an approval was handed over. A reactivation
 * names itself instead, so a re-send afterwards falls back to this — the same
 * link, told in the terms of how the account first came about.
 */
const kindFor = (user: StaffUser): InvitationKind =>
  user.approvedAt ? 'approved' : 'created';

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
   * Send the invitation again — mail is lost, filed as spam, or the seven days
   * ran out. Issuing a new token revokes the outstanding one, so the old link
   * stops working and there is never more than one live way in.
   *
   * Only for an account that is still `invited`: the wording says an account
   * has been set up and a password must be chosen, which stops being true the
   * moment one has been. Somebody who has forgotten a password they did choose
   * goes through password reset (FR-AUTH-02), not through this. A reactivated
   * account is `invited`, so this is its way back too.
   */
  async resend(user: StaffUser): Promise<void> {
    if (user.status !== 'invited') {
      throw new ConflictException({
        code: 'account-not-invited',
        message:
          'Only an account that has not yet chosen a password can be invited again',
      });
    }
    const token = await this.tokens.issue(user.id, INVITE_TTL_MS);
    await this.mail.send(invitationMail(token, this.text, kindFor(user)), {
      to: user.email,
    });
  }

  /**
   * Switch an account off. The status write retires the password and ends every
   * session in flight; this adds the third way in — a set-your-password link
   * sitting unused in a mailbox, which would otherwise be a working key to an
   * account nobody can sign into any more.
   */
  async deactivate(id: string, actorId: string): Promise<StaffUser> {
    const placeholder = await this.passwords.unusableHash();
    const updated = await this.users.deactivate(id, actorId, placeholder);
    await this.tokens.revokeOutstanding(id);
    return updated;
  }

  /**
   * Switch it back on. The account lands on `invited` with no password, so the
   * link is not a courtesy — it is the only way in, and sending it here is what
   * makes one staff click enough. Mail failure is swallowed the same way an
   * approval's is: the status change is recorded, and staff can re-send.
   */
  async reactivate(id: string): Promise<StaffUser> {
    const updated = await this.users.reactivate(id);
    await this.send(updated, 'reactivated');
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
