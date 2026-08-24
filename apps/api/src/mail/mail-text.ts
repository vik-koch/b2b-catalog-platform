import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import { z } from 'zod';

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
    /** The same invitation again, for an account staff switched back on:
     * deactivation retires the password, so returning means choosing a new
     * one rather than remembering the old. */
    accountReactivated: z
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
  })
  .strict();

export type MailText = DeepReadonly<z.infer<typeof mailTextSchema>>;

export const MAIL_TEXT = 'MAIL_TEXT';
