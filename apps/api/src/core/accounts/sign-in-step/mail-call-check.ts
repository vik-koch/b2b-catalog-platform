import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { MailService } from '../../../platform/mail/mail.service';
import { MailText } from '../../../platform/mail/mail-text';
import { signInCallMail } from '../mail/sign-in-code.template';
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
 * A call stood in for by mail (`SIGN_IN_MAIL_KIND=call`): opening the link is
 * the call. No second factor, since the mailbox can also reset the password.
 * Checks live in this process; a restart forgets them.
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

  /** Told once, then forgotten, like a provider's spent check. */
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
