import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * The link that turns an approved registration — or an account staff created,
 * or one switched back on — into a usable one (FR-NOTIF-02). It carries no
 * password: the recipient sets their own, so nothing secret is ever written
 * into a mailbox.
 *
 * The three kinds differ only in wording, because they differ only in what the
 * recipient remembers: one asked for an account and waited, one is being told
 * an account exists, one had an account that stopped working. The link and the
 * deadline are the same.
 */
export type InvitationKind = 'approved' | 'created' | 'reactivated';

export function invitationMail(
  token: string,
  text: MailText,
  kind: InvitationKind,
): MailContent {
  const t = {
    approved: text.accountApproved,
    created: text.accountCreated,
    reactivated: text.accountReactivated,
  }[kind];
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body, text.common.linkExpiry],
    action: { label: t.action, path: `/set-password?token=${token}` },
  };
}
