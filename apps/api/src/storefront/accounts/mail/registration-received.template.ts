import { accountsMail } from '../../../core/accounts/mail/accounts-mail-text';
import { MailContent } from '../../../platform/mail/mail-layout';
import { MailText } from '../../../platform/mail/mail-text';

/** Sent to the visitor who registered (FR-NOTIF-01): a person reviews it,
 * and a second mail brings the password. No link: nothing signs in until
 * approval. */
export function registrationReceivedMail(text: MailText): MailContent {
  const t = accountsMail(text).registrationReceived;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body, t.nextSteps],
  };
}
