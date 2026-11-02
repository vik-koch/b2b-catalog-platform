import { Logger } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';
import { MailText } from '../../mail/mail-text';
import { signInCodeMail } from '../../mail/templates/sign-in-code.template';
import { CodeDelivery, CodeDeliveryError, CodeMessage } from './code-delivery';

/**
 * Delivers a code to the account's address instead of its phone: the local
 * mail catcher in dev, the visitor's inbox on the demo. Whoever reads the
 * mailbox can also reset the password, so this is **no second factor**, and a
 * deployment that needs one names a provider (`SIGN_IN_CODE_URL`).
 *
 * Sent through the mailer directly rather than the dispatcher's queue: the
 * person is waiting on the code screen.
 */
export class MailCodeDelivery implements CodeDelivery {
  readonly channel = 'email';
  private readonly logger = new Logger('MailCodeDelivery');

  constructor(
    private readonly mail: MailService,
    private readonly text: MailText,
  ) {}

  async send(message: CodeMessage): Promise<{ code: string }> {
    try {
      await this.mail.send(signInCodeMail(this.text, message.code), {
        to: message.email,
      });
    } catch (error) {
      this.logger.warn(`Sign-in code mail failed: ${(error as Error).message}`);
      throw new CodeDeliveryError('unavailable', 'Mail could not be sent');
    }
    return { code: message.code };
  }
}
