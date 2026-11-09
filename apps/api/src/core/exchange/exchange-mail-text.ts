import * as z from 'zod';

import { EXCHANGE_AREA } from '@b2b-catalog-platform/shared/core/exchange';
import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';

import { mailTextBlock, type MailText } from '../../platform/mail/mail-text';

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

/** The customer exchange's three. No `created`: an imported account leaves
 * staff no work, as the run already mailed the person a link (FR-ADM-13). */
const customerSyncMails = z.object(syncFeedMails).strict();

/** The order exchange's two. No `waiting`: a write-back is never staged, so
 * the key would be words a deployment writes and nothing sends. */
const orderSyncMails = z
  .object({ failed: syncMailText, recovered: syncMailText })
  .strict();

/** The exchange's block of `texts/mail.json`. */
export const exchangeMailTextShape = {
  /**
   * What an automated exchange writes to the shop (FR-ADM-07/09,
   * FR-NOTIF-09). One section: the mails carry the same facts about a run and
   * differ in the top sentence, so the labels are shared, across areas too.
   * The sentences are keyed by area: "Catalog update failed" is wrong in a
   * subject about a customer run.
   */
  syncRun: z
    .object({
      startedLabel: z.string(),
      /** What the run called itself: an upload's filename, or the source's
       * label for its export. */
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
      /** The sentences, keyed by the run's area. Each area words its own: a
       * stale catalogue sells yesterday's prices, a stalled customer
       * exchange leaves tiers out of step, and neither is the other with a
       * noun swapped. */
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
