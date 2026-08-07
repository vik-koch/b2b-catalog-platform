import { MailContent } from '../mail-layout';
import { MailText } from '../mail-text';

/**
 * The link somebody asked for from the login page (FR-AUTH-02). Same shape as
 * the invitation, and the same page redeems it — what differs is that this one
 * was requested rather than granted, so it says so: a person who did not ask
 * for it needs to know their address was entered on the form, and that
 * ignoring the mail leaves their account exactly as it was.
 *
 * It carries its own expiry line rather than the shared one, because this link
 * lives an hour and the invitation's lives a week — `common.linkExpiry` would
 * be a promise this token does not keep.
 */
export function passwordResetMail(token: string, text: MailText): MailContent {
  const t = text.passwordReset;
  return {
    subject: t.subject,
    preheader: t.preheader,
    heading: t.heading,
    paragraphs: [t.body, t.expiry, t.ignore],
    action: { label: t.action, path: `/set-password?token=${token}` },
  };
}
