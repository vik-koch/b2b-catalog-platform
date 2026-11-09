import { MailContent } from '../../../platform/mail/mail-layout';
import { MailText } from '../../../platform/mail/mail-text';
import { accountsMail } from './accounts-mail-text';

/**
 * The link asked for on the login page (FR-AUTH-02), redeemed like an
 * invitation. It says it was requested: someone who did not ask learns their
 * address was entered, and that ignoring it changes nothing. Its own expiry
 * line, as it lives an hour, not the invitation's week.
 */
export function passwordResetMail(token: string, text: MailText): MailContent {
  const t = accountsMail(text).passwordReset;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body, t.expiry, t.ignore],
    action: { label: t.action, path: `/set-password?token=${token}` },
  };
}
