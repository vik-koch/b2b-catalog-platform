import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import {
  paymentMethodLabels,
  refuseCountForms,
} from '@b2b-catalog-platform/shared';
import * as z from 'zod';

/**
 * Server-side wording for every email the app sends — the API's analog of the
 * frontend AppText, and server-only: unlike the web tokens it is never
 * delivered to a browser. Single-locale like the rest of the app (i18n is out
 * of scope): each deployment ships its one language here.
 *
 * Zod-first: the `MailText` type is inferred from the schema, which validates
 * the mounted per-deployment file (`texts/mail.json`) as one whole unit at boot,
 * so a template whose wording is missing fails the startup rather than sending
 * a half-empty message. The image ships no default.
 *
 * One section per message. A section carries everything the template needs and
 * nothing another template shares, so wording can be reworded per message
 * without a release.
 */
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

export const mailTextSchema = z
  .object({
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
    /** The email the inquiry form sends to the shop (FR-NAV-06). */
    inquiry: z
      .object({
        /** Subject prefix; the submitter's name is appended after a colon. */
        subject: z.string(),
        /** Inbox preview line, shown before the body in most clients. */
        preheader: z.string(),
        heading: z.string(),
        preferredContact: z.string(),
        message: z.string(),
      })
      .strict(),
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
     * sends, `{code}` included; keep it to one message — 70 characters in a
     * non-Latin script — since a second part costs a second message. The rest
     * is only for the mail delivery that dev and the demo use.
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
    /**
     * Confirms a self-deletion (FR-AUTH-06), to the address that asked for it —
     * the last message it gets, since the record no longer carries it. No
     * action: there is nothing to sign in to, and registering again starts a
     * new account rather than restoring this one.
     */
    accountDeleted: z
      .object({
        subject: z.string(),
        preheader: z.string(),
        heading: z.string(),
        body: z.string(),
        /** What was kept, and why — the honest half of "delete". */
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
     * Sent to the shop when an account closes itself (FR-NOTIF-08,
     * FR-AUTH-06). The account is gone before this is read, so the mail
     * carries what it was rather than a link to it — and names what the
     * closure left behind, which is the half a manager has to act on.
     */
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
  })
  .strict()
  .superRefine(refuseCountForms);

export type MailText = DeepReadonly<z.infer<typeof mailTextSchema>>;

export const MAIL_TEXT = 'MAIL_TEXT';
