import { Inject, Injectable, Logger } from '@nestjs/common';
import { InquiryRequest } from '@b2b-catalog-platform/shared/storefront/site';
import { PHONE_INPUT } from '../../platform/config/deployment-config';
import { ConsentService } from '../../core/site/consent.service';
import { env } from '../../platform/env';
import { MailDispatcher } from '../../platform/mail/mail-dispatcher';
import { MAIL_TEXT, MailText } from '../../platform/mail/mail-text';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { inquiryMail } from './inquiry.template';
import {
  formatPhone,
  PhoneConfig,
  SharedText,
} from '@b2b-catalog-platform/shared/platform';

@Injectable()
export class InquiryService {
  private readonly logger = new Logger('Inquiry');

  constructor(
    private readonly mail: MailDispatcher,
    @Inject(MAIL_TEXT) private readonly text: MailText,
    @Inject(SHARED_TEXT) private readonly common: SharedText,
    @Inject(PHONE_INPUT) private readonly phoneInput: PhoneConfig | undefined,
    private readonly consents: ConsentService,
  ) {}

  /**
   * The mail is queued, not sent: nothing is stored, so the visitor's answer
   * never waits on the relay. Only the consent is kept, as the shop's evidence.
   */
  async submit(submission: InquiryRequest): Promise<void> {
    // A normal answer, so the bot learns nothing; logged without content.
    if (submission.website) {
      this.logger.warn('Rejected inquiry: honeypot field populated');
      return;
    }

    const to = env.MAIL_STAFF_TO;
    if (!to) {
      // env.ts requires this in server mode; this narrows the type.
      throw new Error('MAIL_STAFF_TO is not configured');
    }

    const consent = await this.consents.check(
      'contact',
      submission.consentVersion,
    );
    if (consent) {
      await this.consents.record(consent, {
        email: submission.email,
        phone: submission.phone,
      });
    }

    const readable = {
      ...submission,
      // Sent unmasked; grouped again for whoever reads the mail.
      phone: submission.phone
        ? formatPhone(submission.phone, this.phoneInput)
        : undefined,
    };

    await this.mail.dispatch(
      inquiryMail(readable, this.text, this.common),
      {
        to,
        // The submitter, so the shop can answer by hitting reply.
        replyTo: submission.email,
      },
      'inquiry',
    );
  }
}
