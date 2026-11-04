import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import * as z from 'zod';

/** The site's block of `texts/mail.json`. */
export const siteMailTextShape = {
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
};

export type SiteMailText = DeepReadonly<
  z.infer<z.ZodObject<typeof siteMailTextShape>>
>;
