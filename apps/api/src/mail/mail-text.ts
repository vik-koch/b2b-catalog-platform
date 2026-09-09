import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import * as z from 'zod';

/**
 * Server-side wording for every email the app sends — the API's analog of the
 * frontend AppText, and server-only: unlike the web tokens it is never
 * delivered to a browser. Single-locale like the rest of the app (i18n is out
 * of scope): each deployment ships its one language here.
 *
 * Zod-first: the `MailText` type is inferred from the schema, which validates
 * the mounted per-deployment file (MAIL_TEXT_FILE) as one whole unit at boot,
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

export const mailTextSchema = z
  .object({
    /** Wording the shared layout puts on every message. */
    common: z
      .object({
        /** Small print under the card, e.g. why this mail was received. */
        footerNote: z.string(),
        /** Shown under any set-a-password link, next to its button. */
        linkExpiry: z.string(),
        /**
         * How a quantity reads in a mail. A unit is a lens on a piece count
         * (FR-UNIT-01), so anything but the piece states both figures — a mail
         * is read months later, beside goods somebody is counting.
         */
        units: z
          .object({ piece: z.string(), pack: z.string(), box: z.string() })
          .strict(),
        quantity: z.string(),
        quantityPieces: z.string(),
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
        name: z.string(),
        email: z.string(),
        phone: z.string(),
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
        nameLabel: z.string(),
        emailLabel: z.string(),
        phoneLabel: z.string(),
        customerTypeLabel: z.string(),
        /** The two customer kinds, worded for staff reading the mail. */
        customerTypePerson: z.string(),
        customerTypeCompany: z.string(),
        companyNameLabel: z.string(),
        companyIdLabel: z.string(),
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
        referenceLabel: z.string(),
        itemsHeading: z.string(),
        totalLabel: z.string(),
        fulfilmentLabel: z.string(),
        delivery: z.string(),
        pickup: z.string(),
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
        referenceLabel: z.string(),
        customerLabel: z.string(),
        /** An order placed by nobody with an account. */
        guest: z.string(),
        contactLabel: z.string(),
        partyLabel: z.string(),
        fulfilmentLabel: z.string(),
        delivery: z.string(),
        pickup: z.string(),
        paymentLabel: z.string(),
        cash: z.string(),
        transfer: z.string(),
        /** A card payment arranged with the manager — never chosen at
         * checkout, but an order can be adjusted onto it. */
        card: z.string(),
        itemsHeading: z.string(),
        totalLabel: z.string(),
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
        referenceLabel: z.string(),
        customerLabel: z.string(),
        /** An order placed by nobody with an account. */
        guest: z.string(),
        contactLabel: z.string(),
        /** Precedes the reason the customer gave, where they gave one. */
        reasonLabel: z.string(),
        /** Where they gave none: asking for one is a courtesy, not a
         * condition, so its absence is normal and says so. */
        reasonNone: z.string(),
        totalLabel: z.string(),
        /** What the shop may still be holding: the money, where a payment was
         * recorded before the order was called off. A refund is arranged
         * outside the platform (FR-ORD-04), so this line is the only prompt
         * anybody gets. */
        paidNote: z.string(),
        itemsHeading: z.string(),
        action: z.string(),
      })
      .strict(),
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
        referenceLabel: z.string(),
        totalLabel: z.string(),
        /** Precedes the reason a declined or cancelled order carries. */
        reasonLabel: z.string(),
        /** What the shop changed about the order, in their words
         * (FR-ORD-03) — one row per change since the last mail. */
        changedLabel: z.string(),
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
        /** Where the order is going, or where it is waiting. Only on the two
         * `ready` mails: those are the ones whose wording sends the reader
         * somewhere, and every other status mail would be repeating the
         * address back for no reason. */
        deliveryLabel: z.string(),
        pickupLabel: z.string(),
        itemsHeading: z.string(),
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
        referenceLabel: z.string(),
        totalLabel: z.string(),
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
     * The wording of the order summary the API draws (FR-ORD-05, FR-ACC-02).
     *
     * Server-side like the mails and for the same reason: this text is
     * rendered by the API into a file, never delivered to a browser. It is not
     * the admin's or the storefront's wording, and a document is read long
     * after both.
     */
    orderSummaryPdf: z
      .object({
        /** Carries `{reference}`. */
        title: z.string(),
        placedLabel: z.string(),
        statusLabel: z.string(),
        paymentLabel: z.string(),
        invoiceLabel: z.string(),
        deliveryLabel: z.string(),
        pickupLabel: z.string(),
        whenLabel: z.string(),
        /** Where the customer named no date. */
        whenAny: z.string(),
        contactLabel: z.string(),
        noteLabel: z.string(),
        /** The shop's account of what it changed (FR-ORD-03), where there is
         * one. A document that left them out would state a total the customer
         * could not account for. */
        changesLabel: z.string(),
        itemsLabel: z.string(),
        quantityLabel: z.string(),
        lineTotalLabel: z.string(),
        totalLabel: z.string(),
        /** Printed at the foot of every page: what this document is, and what
         * it is not (ADR 0052). */
        footer: z.string(),
        statuses: z
          .object({
            requested: z.string(),
            approved: z.string(),
            ready: z.string(),
            completed: z.string(),
            declined: z.string(),
            cancelled: z.string(),
          })
          .strict(),
        payments: z
          .object({
            cash: z.string(),
            bankTransfer: z.string(),
            cardLater: z.string(),
          })
          .strict(),
        paymentStates: z
          .object({
            notDue: z.string(),
            awaiting: z.string(),
            paid: z.string(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type MailText = DeepReadonly<z.infer<typeof mailTextSchema>>;

export const MAIL_TEXT = 'MAIL_TEXT';
