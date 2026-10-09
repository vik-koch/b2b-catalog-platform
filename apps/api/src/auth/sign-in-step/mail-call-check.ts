import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';
import { MailText } from '../../mail/mail-text';
import { signInCallMail } from '../../mail/templates/sign-in-code.template';
import {
  CallCheck,
  CallCheckRequest,
  CallCheckStarted,
  CallCheckStatus,
} from './call-check';
import { CodeDeliveryError } from './code-delivery';

/** As long as a provider typically keeps a check open. */
const CHECK_TTL_MS = 5 * 60 * 1000;

/** Where the stand-in link lands; the API's own route answers the check. */
export const STAND_IN_PATH = '/api/auth/sign-in-step/stand-in/';

/**
 * Stands in for a call by mail (`SIGN_IN_MAIL_KIND=call`): the account's
 * mailbox gets a link, and opening it is the call. Lets dev exercise the call
 * screen without a provider. Whoever reads the mailbox can also reset the
 * password, so this is **no second factor**.
 *
 * The checks live in this process, since only the provider would hold them
 * otherwise: a restart forgets them, and the person asks for a new one.
 */
export class MailCallCheck implements CallCheck {
  readonly channel = 'email';
  private readonly logger = new Logger('MailCallCheck');
  private readonly checks = new Map<
    string,
    { expiresAt: number; answered: boolean }
  >();

  constructor(
    private readonly mail: MailService,
    private readonly text: MailText,
  ) {}

  async start(request: CallCheckRequest): Promise<CallCheckStarted> {
    this.forgetExpired();
    const reference = randomBytes(24).toString('base64url');
    try {
      await this.mail.send(
        signInCallMail(this.text, STAND_IN_PATH + reference),
        { to: request.email },
      );
    } catch (error) {
      this.logger.warn(`Sign-in call mail failed: ${(error as Error).message}`);
      throw new CodeDeliveryError('unavailable', 'Mail could not be sent');
    }
    this.checks.set(reference, {
      expiresAt: Date.now() + CHECK_TTL_MS,
      answered: false,
    });
    return { callTo: request.phone, reference, expiresInMs: CHECK_TTL_MS };
  }

  /** A confirmed check is told once and then forgotten, as a provider's
   * spent check is: the link stops working with it. */
  async status(reference: string): Promise<CallCheckStatus> {
    const check = this.checks.get(reference);
    if (!check || check.expiresAt <= Date.now()) return 'expired';
    if (!check.answered) return 'pending';
    this.checks.delete(reference);
    return 'confirmed';
  }

  /** The link was opened. False where the check is unknown or over. */
  answer(reference: string): boolean {
    const check = this.checks.get(reference);
    if (!check || check.expiresAt <= Date.now()) return false;
    check.answered = true;
    return true;
  }

  private forgetExpired(): void {
    const now = Date.now();
    for (const [reference, check] of this.checks) {
      if (check.expiresAt <= now) this.checks.delete(reference);
    }
  }
}
