import * as z from 'zod';

/** A reply that only says the request was done, in developer-facing words
 * no screen shows. */
export const acknowledgementSchema = z.object({ message: z.string() });
