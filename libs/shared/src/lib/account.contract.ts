import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { customerTypeSchema, userRoleSchema } from './auth.contract';

const c = initContract();

/**
 * What the account holder sees of their own record (FR-AUTH-06's neighbourhood:
 * the self-service area). Deliberately *not* the staff DTO with a field or two
 * removed — it is a separate shape because it answers a different question, and
 * the difference is load-bearing: it carries no `tierId`, since a customer's
 * pricing group is staff's to assign and not theirs to see (ADR 0031).
 *
 * Every identifying field is nullable, matching the column: staff accounts are
 * created by other staff and describe nobody.
 */
export const accountProfileSchema = z.object({
  email: z.string().email(),
  role: userRoleSchema,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  customerType: customerTypeSchema.nullable(),
  companyRegistrationId: z.string().nullable(),
  /** When the account was registered — the "member since" line. */
  createdAt: z.string().datetime(),
});
export type AccountProfile = z.infer<typeof accountProfileSchema>;

/**
 * The signed-in account's own surface. One read today; addresses and order
 * history land here rather than on the staff contract, because the question
 * "what is on my account" is the account holder's, whatever their role.
 */
export const accountContract = c.router({
  getProfile: {
    method: 'GET',
    path: '/account/profile',
    responses: {
      200: accountProfileSchema,
      401: z.object({ message: z.string() }),
    },
    summary: "The signed-in account's own details",
  },
});
