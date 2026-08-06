import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * Sent to the visitor who registered (FR-NOTIF-01). It confirms the request and
 * says what happens next — that a person reviews it, and that a second mail
 * brings the password. Nothing here is actionable yet, so it carries no link
 * back into the app: the account cannot sign in until it is approved.
 */
export function registrationReceivedMail(text: MailText): MailContent {
  const t = text.registrationReceived;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body, t.nextSteps],
  };
}
