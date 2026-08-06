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
    /** Sent to the shop when a registration arrives (FR-NOTIF-04). */
    newRegistration: z
      .object({
        subject: z.string(),
        preheader: z.string(),
        heading: z.string(),
        body: z.string(),
        emailLabel: z.string(),
        /** Button into the admin account list, where it is approved. */
        action: z.string(),
      })
      .strict(),
  })
  .strict();

export type MailText = DeepReadonly<z.infer<typeof mailTextSchema>>;

export const MAIL_TEXT = 'MAIL_TEXT';
