import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * Sent to the shop when someone registers (FR-NOTIF-04). Staff are the only
 * ones who can move the account forward, so this is the one mail that links
 * into the admin panel — the account list, where the pending request is waiting
 * to be approved and given a tier.
 *
 * The registrant's address is the whole content: nothing else is known yet.
 */
export function newRegistrationMail(
  email: string,
  text: MailText,
): MailContent {
  const t = text.newRegistration;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body],
    rows: [{ label: t.emailLabel, value: email }],
    action: { label: t.action, path: '/admin/users' },
  };
}
