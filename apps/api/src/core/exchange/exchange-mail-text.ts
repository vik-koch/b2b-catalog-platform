import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import { EXCHANGE_AREA } from '@b2b-catalog-platform/shared/core/exchange';
import * as z from 'zod';
import { type MailText, mailTextBlock } from '../../platform/mail/mail-text';

/** One sync outcome: its own subject and its own two lines. Subject and
 * preheader are per outcome rather than shared, because these land in an
 * inbox side by side and a common subject would make them one thread. The
 * button into the run is the same in every area, so it is said once. */
const syncMailText = z
  .object({
    subject: z.string(),
    preheader: z.string(),
    heading: z.string(),
    body: z.string(),
  })
  .strict();

/**
 * The three outcomes every area sends, which are the three that are about the
 * exchange itself rather than about what it carried.
 */
const syncFeedMails = {
  /** The exchange stopped working. Goes to the admin, and to the operator
   * where one is configured: the admin cannot fix it, but they are the one who
   * knows it is broken and who asks. */
  failed: syncMailText,
  /** It works again. Sent once, to the same readers, so a failure that was
   * announced is never left open. */
  recovered: syncMailText,
  /** A run is staged and nobody has decided it. */
  waiting: syncMailText,
};

/**
 * The catalog's, which has a fourth: a run that applied itself and brought
 * products that are off the storefront until somebody writes their pages and
 * publishes them (FR-ADM-06).
 */
const catalogSyncMails = z
  .object({
    ...syncFeedMails,
    /** Opens the products awaiting publication rather than the run. */
    created: syncMailText.extend({ action: z.string() }).strict(),
  })
  .strict();

/**
 * The customer exchange's three.
 *
 * Deliberately without a `created`. The catalog's fourth mail exists because
 * an imported product leaves work on somebody's desk; an imported account does
 * not. What an invited account needs is a password, and the run has already
 * mailed the person themselves a link to set one (FR-ADM-13) — telling the
 * admin as well would be announcing a queue that nobody is standing in.
 */
const customerSyncMails = z.object(syncFeedMails).strict();

/**
 * The order exchange's two.
 *
 * Without a `waiting` as well as without a `created`, and the missing one is
 * the interesting one: an order write-back is never staged (ADR 0062), so
 * there is no run for a person to decide and no mail that could point at one.
 * A key here would be a sentence the deployment writes and the platform can
 * never send.
 */
const orderSyncMails = z
  .object({ failed: syncMailText, recovered: syncMailText })
  .strict();

/** The exchange's block of `texts/mail.json`. */
export const exchangeMailTextShape = {
  /**
   * What an automated exchange writes to the shop (FR-ADM-07/09,
   * FR-NOTIF-09).
   *
   * One section rather than one per outcome, because these messages are the
   * same message about different outcomes: they carry the same facts about
   * the same run, and only the sentence at the top differs. The labels are
   * shared for the same reason a status mail's are — a run described two
   * ways in two mails is a run nobody can follow across them.
   *
   * The labels are shared across the areas too; the sentences are not.
   * "Catalog update failed" is the wrong thing to send a manager about a
   * customer run, and it is wrong in the one place a mail is read — the
   * subject line — so the wording is keyed by area and the facts around it
   * are not.
   */
  syncRun: z
    .object({
      startedLabel: z.string(),
      /** What the run called itself — a filename for an upload, a label the
       * automated source chose for its export. */
      labelLabel: z.string(),
      /** Which credential submitted it, so a deployment with more than one
       * source says which one this was. */
      sourceLabel: z.string(),
      /** Created / updated / hidden, as one line. */
      changesLabel: z.string(),
      /** The reported reason a run broke. Never an exception's text: what
       * the automated source said about itself. */
      errorLabel: z.string(),
      /** Why it is waiting rather than applied. */
      reasonLabel: z.string(),
      reasons: z
        .object({
          /** Its effect was outside what the deployment lets a run apply
           * unattended. */
          policy: z.string(),
          /** The source asked to be doubted. */
          requested: z.string(),
        })
        .strict(),
      /** The button into the run, from a failure or a recovery. */
      openRun: z.string(),
      /** The same button, from a run that waits for a decision. */
      reviewRun: z.string(),
      /**
       * The sentences, keyed by the area the run is about.
       *
       * An area carries its own wording rather than a placeholder filled
       * with its name, because the sentence under the heading is not the
       * same sentence with a noun swapped: a stale catalog is a shop selling
       * yesterday's prices, and a stalled customer exchange is tiers that no
       * longer match what the other system says. Both need saying, and
       * neither is a template of the other.
       */
      areas: z
        .object({
          catalog: catalogSyncMails,
          customers: customerSyncMails,
          orders: orderSyncMails,
        })
        .strict(),
    })
    .strict(),
};

export type ExchangeMailText = DeepReadonly<
  z.infer<z.ZodObject<typeof exchangeMailTextShape>>
>;

/** The block from the whole mail text, which is checked at boot. */
export function exchangeMail(text: MailText): ExchangeMailText {
  return mailTextBlock<ExchangeMailText>(text, EXCHANGE_AREA);
}
