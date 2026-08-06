import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * The link that turns an approved registration — or an account staff created —
 * into a usable one (FR-NOTIF-02). It carries no password: the recipient sets
 * their own, so nothing secret is ever written into a mailbox.
 *
 * `approved` and `created` differ only in wording, because they differ only in
 * what the recipient remembers: one asked for an account and waited, the other
 * is being told one exists. The link and the deadline are the same.
 */
export function invitationMail(
  token: string,
  text: MailText,
  kind: 'approved' | 'created',
): MailContent {
  const t = kind === 'approved' ? text.accountApproved : text.accountCreated;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body, text.common.linkExpiry],
    action: { label: t.action, path: `/set-password?token=${token}` },
  };
}
