import * as z from 'zod';

/** A code on its way: where it went and which number it signs in with or
 * confirms, both masked, and the seconds until another may be asked for. */
export const codeSentSchema = z
  .object({
    sentTo: z.string(),
    phone: z.string(),
    resendIn: z.number().int().nonnegative(),
  })
  .strict();
export type CodeSent = z.infer<typeof codeSentSchema>;

/** What both kinds of step state: the number it proves (masked), the seconds
 * until another code or check may be asked for, whether completing it also
 * confirms that number, and the days a browser may be remembered (0: never). */
const stepCommon = {
  phone: z.string(),
  resendIn: z.number().int().nonnegative(),
  confirming: z.boolean(),
  rememberDays: z.number().int().nonnegative(),
};

/**
 * The step owed before a session begins (FR-AUTH-12), answered instead of the
 * user by every route that would start one. `code`: a code went to `sentTo`
 * (the phone, or the mailbox). `call`: the person calls `callTo` from `phone`
 * within `expiresIn` seconds, `dial` being the number a phone link dials.
 */
export const codeStepSchema = codeSentSchema
  .extend({ step: z.literal('code'), ...stepCommon })
  .strict();
export const callStepSchema = z
  .object({
    step: z.literal('call'),
    callTo: z.string(),
    dial: z.string(),
    expiresIn: z.number().int().nonnegative(),
    sentTo: z.string().optional(),
    ...stepCommon,
  })
  .strict();
export const signInStepSchema = z.discriminatedUnion('step', [
  codeStepSchema,
  callStepSchema,
]);
export type SignInStep = z.infer<typeof signInStepSchema>;
export type CallStep = z.infer<typeof callStepSchema>;
