import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * The link that turns an approved registration — or an account staff created —
 * into a usable one (FR-NOTIF-02). It carries no password: the recipient sets
 * their own, so nothing secret is ever written into a mailbox.
 *
 * The two kinds differ only in wording, because they differ only in what the
 * recipient remembers: one asked for an account and waited, one is being told
 * an account exists. The link and the deadline are the same.
 *
 * There is no wording for an account switched back on, and that is the point:
 * a reactivated account keeps the password it had, so nothing is sent and its
 * owner is never told their account was off.
 */
export type InvitationKind = 'approved' | 'created';

export function invitationMail(
  token: string,
  text: MailText,
  kind: InvitationKind,
): MailContent {
  const t = {
    approved: text.accountApproved,
    created: text.accountCreated,
  }[kind];
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body, text.common.linkExpiry],
    action: { label: t.action, path: `/set-password?token=${token}` },
  };
}
