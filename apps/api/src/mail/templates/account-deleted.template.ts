import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * Sent to the address that just deleted its own account (FR-AUTH-06), and the
 * last thing that address hears from the shop — the record it belonged to no
 * longer carries it. No link back: there is nothing left to sign in to, and
 * registering again is a new account rather than an undo.
 */
export function accountDeletedMail(text: MailText): MailContent {
  const t = text.accountDeleted;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body, t.orders],
  };
}
