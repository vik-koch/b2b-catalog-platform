import * as z from 'zod';

/**
 * A blank form field arrives as `''`: read it as absent, so an optional
 * field's checks judge only what was typed.
 */
export const blankAsAbsent = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    schema,
  );

/**
 * A decoy the real form hides: a person leaves it empty, a bot that fills
 * every input gives itself away.
 */
export const honeypotField = blankAsAbsent(z.string().max(2000).optional());
