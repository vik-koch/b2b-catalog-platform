import { accountsMail } from './accounts-mail-text';
import { MailContent } from '../../../platform/mail/mail-layout';
import { MailText } from '../../../platform/mail/mail-text';

/**
 * The link that makes an approved or staff-created account usable
 * (FR-NOTIF-02). No password: the recipient sets one, so nothing secret
 * reaches a mailbox. The two kinds differ only in wording: one asked and
 * waited, one is told. A reactivated account keeps its password, so it gets
 * nothing and is never told it was off.
 */
export type InvitationKind = 'approved' | 'created';

export function invitationMail(
  token: string,
  text: MailText,
  kind: InvitationKind,
): MailContent {
  const t = {
    approved: accountsMail(text).accountApproved,
    created: accountsMail(text).accountCreated,
  }[kind];
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body, text.common.linkExpiry],
    action: { label: t.action, path: `/set-password?token=${token}` },
  };
}
