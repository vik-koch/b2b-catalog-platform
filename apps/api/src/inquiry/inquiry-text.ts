import { DeepReadonly } from '@b2b-catalog-platform/shared/node';
import { z } from 'zod';

/**
 * Server-side wording for the inquiry email — the labels the shop sees in the
 * message the form generates (the API's analog of the frontend AppText, and
 * server-only: unlike the web tokens it is never delivered to a browser).
 * Single-locale like the rest of the app (i18n is out of scope): each deployment
 * ships its one language here.
 *
 * Zod-first: the `InquiryText` type is inferred from the schema, which
 * validates the mounted per-deployment file (INQUIRY_TEXT_FILE) as one whole
 * unit at boot. The image ships no default.
 */
export const inquiryTextSchema = z
  .object({
    /** The email the inquiry form sends to the shop. */
    inquiry: z
      .object({
        /** Subject prefix; the submitter's name is appended after a colon. */
        subject: z.string(),
        name: z.string(),
        email: z.string(),
        phone: z.string(),
        preferredContact: z.string(),
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export type InquiryText = DeepReadonly<z.infer<typeof inquiryTextSchema>>;

export const INQUIRY_TEXT = 'INQUIRY_TEXT';
