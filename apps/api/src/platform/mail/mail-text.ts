import {
  DeepReadonly,
  paymentMethodLabels,
} from '@b2b-catalog-platform/shared/platform';
import * as z from 'zod';

/** What one status says: the line at the top, and the line under it. */
const statusMailText = z
  .object({ heading: z.string(), body: z.string() })
  .strict();

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

/**
 * The keys of `texts/mail.json` no area claims: one section per message, so
 * a message is reworded without a release.
 */
export const mailTextShape = {
  /** Wording the shared layout puts on every message. */
  common: z
    .object({
      /** Small print under the card, e.g. why this mail was received. */
      footerNote: z.string(),
      /** Shown under any set-a-password link, next to its button. */
      linkExpiry: z.string(),
    })
    .strict(),
  /** What the staff order mails call an order's parts, where staff read
   * them differently from customers — the admin has the same words. */
  orders: z
    .object({
      account: z.string(),
      /** An order placed without an account. */
      guest: z.string(),
      items: z.string(),
      paymentMethods: paymentMethodLabels,
    })
    .strict(),
  /**
   * Sent to the customer when an order request arrives (FR-NOTIF-06). It is
   * a receipt for a request, never a confirmation of a sale — a manager
   * still answers it — and it carries the link that opens the order without
   * signing in, which for a guest is the only record they have.
   */
  orderReceived: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      /** Confirms the request arrived; `{reference}` is substituted. */
      body: z.string(),
      /** What happens next: a person reads it and comes back. */
      nextSteps: z.string(),
      /** Button to the order summary the link opens. */
      action: z.string(),
    })
    .strict(),
  /**
   * Sent to the shop when an order request arrives (FR-NOTIF-05). Staff are
   * the ones who answer it, so this one links into the admin order view.
   */
  newOrder: z
    .object({
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      body: z.string(),
      action: z.string(),
    })
    .strict(),
  /**
   * Sent to the shop when a customer calls their own order off
   * (FR-NOTIF-07). The one move a customer has, and the shop's cue to stop
   * packing — so it is a mail and not a queue: by the time somebody opens
   * the panel the box may already be on the van.
   */
  orderCancelled: z
    .object({
      /** The reference is appended, as on every other order mail. */
      subject: z.string(),
      preheader: z.string(),
      heading: z.string(),
      body: z.string(),
      /** Precedes the reason the customer gave, where they gave one. */
      reasonLabel: z.string(),
      /** Where they gave none: asking for one is a courtesy, not a
       * condition, so its absence is normal and says so. */
      reasonNone: z.string(),
      /** What the shop may still be holding: the money, where a payment was
       * recorded before the order was called off. A refund is arranged
       * outside the platform (FR-ORD-04), so this line is the only prompt
       * anybody gets. */
      paidNote: z.string(),
      itemsHeading: z.string(),
      action: z.string(),
    })
    .strict(),
  /**
   * Sent to the customer whenever their order moves (FR-NOTIF-03).
   *
   * One mail with a heading and a body per state, rather than a template per
   * state: everything around the words — the reference, the total, the link
   * back — is the same in all of them, and a shop rewording its acceptance
   * should not have to be told which of seven files to open.
   *
   * `ready` appears twice because it reads two ways: a collected order is
   * ready to be picked up, a delivered one is on its way. It is one state
   * (ADR 0050) and two sentences.
   */
  orderStatusChanged: z
    .object({
      /** The reference is appended, as on every other order mail. */
      subject: z.string(),
      preheader: z.string(),
      /** Said first wherever a mail carries changes: the reader has to know
       * the order itself moved before being told where it stands. */
      changedIntro: z.string(),
      /** Said first where the message is the shop walking the order back a
       * step (FR-ORD-02). Without it the mail would announce a state the
       * customer was already past as though it were the next one. */
      correctedIntro: z.string(),
      /** Said where the shop's payment instructions travel with the
       * message (FR-ORD-05). Only then: a mail that promised an attachment
       * it does not carry is worse than one that says nothing. */
      attachedNote: z.string(),
      action: z.string(),
      statuses: z
        .object({
          /** An order the shop had ended and has put back in its queue —
           * the only way a move lands on `requested`. */
          reopened: statusMailText,
          /** A message about the order having *changed*, where nothing about
           * it moved (FR-ORD-03). It needs a heading of its own: every other
           * entry here announces a step, and there was no step. */
          changed: statusMailText,
          approved: statusMailText,
          readyDelivery: statusMailText,
          readyPickup: statusMailText,
          completed: statusMailText,
          declined: statusMailText,
          cancelled: statusMailText,
        })
        .strict(),
    })
    .strict(),
  /**
   * The message a supplied document sends on its own (FR-ORD-05).
   *
   * Its own section because it is its own kind of message: nothing about the
   * order changed, and a mail that borrowed the status wording would
   * announce a step that never happened.
   */
  orderDocument: z
    .object({
      /** The reference is appended, as on every other order mail. */
      subject: z.string(),
      preheader: z.string(),
      action: z.string(),
      /** One entry per kind: what arrived, said in the way that kind of
       * document is talked about. */
      kinds: z
        .object({
          paymentInstructions: statusMailText,
          orderSummary: statusMailText,
        })
        .strict(),
    })
    .strict(),
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

export type MailText = DeepReadonly<z.infer<z.ZodObject<typeof mailTextShape>>>;

export const MAIL_TEXT = 'MAIL_TEXT';

/** An area's block of the mail text. Typed apart, but the file is checked
 * whole against every area's shape at boot, so the block is there. */
export function mailTextBlock<T>(text: MailText, area: string): T {
  return (text as unknown as Record<string, T>)[area];
}
