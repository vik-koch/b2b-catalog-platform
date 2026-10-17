import * as z from 'zod';

/** A confirmation dialog's words. A view decides when to show `warning`;
 * without a `cancel` of its own the dialog uses the common one. */
export const confirmText = z
  .object({
    heading: z.string(),
    message: z.string(),
    confirm: z.string(),
    cancel: z.string().optional(),
    warning: z.string().optional(),
  })
  .strict();
