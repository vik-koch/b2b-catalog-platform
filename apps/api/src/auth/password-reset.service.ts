import { Inject, Injectable, Logger } from '@nestjs/common';
import { MAIL_TEXT, MailText } from '../mail/mail-text';
import { MailService } from '../mail/mail.service';
import { invitationMail } from '../mail/templates/invitation.template';
import { passwordResetMail } from '../mail/templates/password-reset.template';
import { UsersService } from '../users/users.service';
import {
  INVITE_TTL_MS,
  PasswordTokenService,
  RESET_TTL_MS,
} from './password-token.service';

/**
 * "I cannot get in" (FR-AUTH-02). Requesting a link is deliberately the only
 * half that is new: redeeming one is `PasswordSetupService`, which already
 * serves the invitation and reads the purpose off the account's status.
 *
 * The caller learns nothing. Whether the address is known, belongs to an
 * account that may sign in, or is a stranger's, this does the same visible
 * thing — a form that answered differently would be a way to test which
 * addresses are customers.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger('PasswordReset');

  constructor(
    private readonly users: UsersService,
    private readonly tokens: PasswordTokenService,
    private readonly mail: MailService,
    @Inject(MAIL_TEXT) private readonly text: MailText,
  ) {}

  async request(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;

    // `pending` has nobody's decision behind it yet, `disabled` was switched
    // off on purpose, `anonymized` is a tombstone. A link to any of them would
    // be a way back into an account that is meant to be shut.
    if (user.status !== 'active' && user.status !== 'invited') return;

    try {
      await this.sendLink(user);
    } catch (error) {
      // Never surfaced: the response is uniform by design, so a failure here
      // reaches the operator through the log rather than the visitor.
      this.logger.error(`Could not send a password link: ${String(error)}`);
    }
  }

  /**
   * Mint a link and mail it, whichever kind the account needs — the shared
   * half of "let this person in", asked for by the account holder from the
   * login form and by staff from the account screen (FR-AUTH-04).
   *
   * An `invited` account has no password to reset: what it is missing is the
   * invitation, so that is what it gets, at the invitation's own deadline. An
   * `active` one gets the reset mail, whose wording — somebody asked for this,
   * ignore it and nothing changes — is true either way round, since a manager
   * pressing the button on somebody's behalf *is* somebody asking.
   *
   * Callers decide what a failure means. Here it is swallowed, because the
   * visitor is told nothing either way; from the staff screen the mail **is**
   * the request, so it is reported. Whether the account may be sent one at all
   * is the caller's check too — this one is only asked about accounts that
   * passed it.
   */
  async sendLink(user: {
    id: string;
    email: string;
    status: string;
    /** A row's timestamp or a serialized one — only its presence is read. */
    approvedAt: Date | string | null;
  }): Promise<void> {
    if (user.status === 'invited') {
      const token = await this.tokens.issue(user.id, INVITE_TTL_MS);
      await this.mail.send(
        // `approved` or `created`, told by how the account came about.
        invitationMail(
          token,
          this.text,
          user.approvedAt ? 'approved' : 'created',
        ),
        { to: user.email },
      );
      return;
    }

    const token = await this.tokens.issue(user.id, RESET_TTL_MS);
    await this.mail.send(passwordResetMail(token, this.text), {
      to: user.email,
    });
  }
}
