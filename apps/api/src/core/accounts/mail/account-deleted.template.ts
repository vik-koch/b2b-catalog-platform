import { accountsMail } from './accounts-mail-text';
import { MailContent } from '../../../platform/mail/mail-layout';
import { MailText } from '../../../platform/mail/mail-text';

/** Sent to the address that deleted its account (FR-AUTH-06), the last mail
 * it gets. No link: there is nothing to sign in to, and registering again is a
 * new account, not an undo. */
export function accountDeletedMail(text: MailText): MailContent {
  const t = accountsMail(text).accountDeleted;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body, t.orders],
  };
}
