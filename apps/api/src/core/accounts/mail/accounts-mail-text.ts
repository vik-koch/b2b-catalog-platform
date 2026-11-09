import * as z from 'zod';

import { ACCOUNTS_AREA } from '@b2b-catalog-platform/shared/core/accounts';
import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';

import { mailTextBlock, type MailText } from '../../../platform/mail/mail-text';

/** The accounts' block of `texts/mail.json`: one section per message. */
export const accountsMailTextShape = {
  /** Sent to the visitor who registered (FR-NOTIF-01). */
  registrationReceived: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      /** Confirms the request arrived. */
      body: z.string(),
      /** What happens next: staff review, then a second mail with the password. */
      nextSteps: z.string(),
    })
    .strict(),
  /** The invitation an approved registration receives (FR-NOTIF-02). */
  accountApproved: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      body: z.string(),
      /** Button label on the set-your-password link. */
      action: z.string(),
    })
    .strict(),
  /** The same invitation, for an account staff created unprompted. */
  accountCreated: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      body: z.string(),
      action: z.string(),
    })
    .strict(),
  /**
   * The reset link somebody asked for from the login page (FR-AUTH-02).
   * Carries its own `expiry` rather than `common.linkExpiry`: a reset link
   * lives an hour, an invitation a week.
   */
  passwordReset: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      body: z.string(),
      expiry: z.string(),
      /** For the recipient who did not ask: doing nothing changes nothing. */
      ignore: z.string(),
      action: z.string(),
    })
    .strict(),
  /**
   * A sign-in code (FR-AUTH-12). `message` is the whole text a provider
   * sends, `{code}` included; keep it to one message (70 characters in a
   * non-Latin script), as a second part costs again. The rest is for the mail
   * delivery dev and the demo use.
   */
  signInCode: z
    .object({
      message: z.string().includes('{code}'),
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      /** For the recipient who did not sign in. */
      ignore: z.string(),
    })
    .strict(),
  /**
   * The mail that stands in for a sign-in call (FR-AUTH-12), where dev or
   * the demo prove the number by mail. Its link does what the call would.
   */
  signInCall: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      body: z.string(),
      action: z.string(),
      /** For the recipient who did not sign in. */
      ignore: z.string(),
    })
    .strict(),
  /** Confirms a self-deletion (FR-AUTH-06), the address's last message. No
   * action: nothing is left to sign in to. */
  accountDeleted: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      body: z.string(),
      /** What was kept, and why: the honest half of "delete". */
      orders: z.string(),
    })
    .strict(),
  /** Sent to the shop when a registration arrives (FR-NOTIF-04). */
  newRegistration: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      body: z.string(),
      customerTypeLabel: z.string(),
      /** Button into the admin account list, where it is approved. */
      action: z.string(),
    })
    .strict(),
  /** Sent to the shop when an account closes itself (FR-NOTIF-08,
   * FR-AUTH-06): what the account was, and what it left for a manager. */
  accountClosed: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      body: z.string(),
      nameLabel: z.string(),
      /** How many of their orders were kept and anonymized; `{count}` is
       * substituted. */
      ordersLabel: z.string(),
      /** What is left to do about them, where any are still open. */
      openOrdersNote: z.string(),
      action: z.string(),
    })
    .strict(),
};

export type AccountsMailText = DeepReadonly<
  z.infer<z.ZodObject<typeof accountsMailTextShape>>
>;

/** The block from the whole mail text, which is checked at boot. */
export function accountsMail(text: MailText): AccountsMailText {
  return mailTextBlock<AccountsMailText>(text, ACCOUNTS_AREA);
}
