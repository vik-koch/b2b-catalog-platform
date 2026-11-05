import { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import * as z from 'zod';

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
};

export type MailText = DeepReadonly<z.infer<z.ZodObject<typeof mailTextShape>>>;

export const MAIL_TEXT = 'MAIL_TEXT';

/** An area's block of the mail text. Typed apart, but the file is checked
 * whole against every area's shape at boot, so the block is there. */
export function mailTextBlock<T>(text: MailText, area: string): T {
  return (text as unknown as Record<string, T>)[area];
}
