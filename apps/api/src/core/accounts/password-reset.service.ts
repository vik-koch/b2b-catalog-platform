import { Inject, Injectable, Logger } from '@nestjs/common';
import { MAIL_TEXT, MailText } from '../../platform/mail/mail-text';
import { MailDispatcher } from '../../platform/mail/mail-dispatcher';
import { invitationMail } from './mail/invitation.template';
import { passwordResetMail } from './mail/password-reset.template';
import { UsersService } from './users.service';
import {
  INVITE_TTL_MS,
  PasswordTokenService,
  RESET_TTL_MS,
} from './password-token.service';

/**
 * "I cannot get in" (FR-AUTH-02): asking for a link. The caller learns
 * nothing either way, or the form would tell which addresses are customers.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    private readonly users: UsersService,
    private readonly tokens: PasswordTokenService,
    private readonly mail: MailDispatcher,
    @Inject(MAIL_TEXT) private readonly text: MailText,
  ) {}

  async request(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;

    // A link to any other status reopens an account meant to be shut.
    if (user.status !== 'active' && user.status !== 'invited') return;

    try {
      await this.sendLink(user);
    } catch (error) {
      // The answer is uniform, so a failure goes to the log only.
      this.logger.error(`Could not issue a password link: ${String(error)}`);
    }
  }

  /**
   * Mint a link and queue its mail, for the holder at the login form and for
   * staff alike (FR-AUTH-04). An `invited` account gets its invitation again,
   * an `active` one the reset mail. Whether it may get one is the caller's
   * check.
   */
  async sendLink(user: {
    id: string;
    email: string;
    status: string;
    /** A row's or a serialized timestamp; only its presence is read. */
    approvedAt: Date | string | null;
  }): Promise<void> {
    if (user.status === 'invited') {
      const token = await this.tokens.issue(user.id, INVITE_TTL_MS);
      await this.mail.dispatch(
        invitationMail(
          token,
          this.text,
          user.approvedAt ? 'approved' : 'created',
        ),
        { to: user.email },
        'invitation',
      );
      return;
    }

    const token = await this.tokens.issue(user.id, RESET_TTL_MS);
    await this.mail.dispatch(
      passwordResetMail(token, this.text),
      { to: user.email },
      'password reset',
    );
  }
}
