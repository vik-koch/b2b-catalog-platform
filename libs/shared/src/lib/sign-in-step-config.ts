// Namespace import, not `{ z }`: the named form defeats tree shaking and
// pulls zod's 63 locale files into the bundle (colinhacks/zod#6050).
import * as z from 'zod';
import { SIGN_IN_STEP_MODES, USER_ROLES } from './auth-constants';

/**
 * The second sign-in step (FR-AUTH-12): how often a code is asked for, and of
 * which roles. Policy, so it is the operator's file and not an admin setting —
 * which roles take the step follows from the rule a deployment is under.
 * Absent means `off`. Read by the API only; checked by both apps because both
 * parse the same file.
 */
export const signInStepConfigSchema = z
  .object({
    mode: z.enum(SIGN_IN_STEP_MODES),
    roles: z.array(z.enum(USER_ROLES)),
  })
  .strict();
export type SignInStepConfig = z.infer<typeof signInStepConfigSchema>;
