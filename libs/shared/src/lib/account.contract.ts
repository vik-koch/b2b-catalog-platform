import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { apiErrorSchema, commonAuthErrorSchema } from './api-error';
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
  companyName: z.string().nullable(),
  companyRegistrationId: z.string().nullable(),
  /** When the account was registered — the "member since" line. */
  createdAt: z.string().datetime(),
});
export type AccountProfile = z.infer<typeof accountProfileSchema>;

/**
 * What the account holder may correct about themselves: how they are called and
 * how they are reached.
 *
 * Not here, deliberately: `email` is the sign-in name and the audit identity, so
 * changing it needs a verification flow to the new address that nothing in the
 * product does yet; `customerType` and `companyRegistrationId` are the evidence
 * staff approved the account and its tier on, and letting the holder flip them
 * afterwards would silently change the basis of a decision nobody re-reviews.
 * Both are staff edits (`updateUserSchema`), which is what the page points at.
 */
export const updateAccountProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(200),
    lastName: z.string().trim().min(1).max(200),
    /** Null clears it — staff accounts often have none to begin with. */
    phone: z.string().trim().min(1).max(50).nullable(),
  })
  // strict: unknown keys are rejected, not stripped (NFR-SEC-05). It is what
  // stops `role`, `tierId` or `status` riding along on a self-service write.
  .strict();
export type UpdateAccountProfileRequest = z.infer<
  typeof updateAccountProfileSchema
>;

/**
 * Deleting your own account (FR-AUTH-06). The current password is required for
 * the same reason it is on a password change: this is irreversible, and an
 * unlocked laptop should not be enough to do it.
 */
export const deleteAccountSchema = z
  .object({ password: z.string().min(1) })
  .strict();
export type DeleteAccountRequest = z.infer<typeof deleteAccountSchema>;

/**
 * The signed-in account's own surface. Read and correct your own details today;
 * addresses and order history land here rather than on the staff contract,
 * because the question "what is on my account" is the account holder's,
 * whatever their role.
 */
export const accountContract = c.router({
  getProfile: {
    method: 'GET',
    path: '/account/profile',
    responses: {
      200: accountProfileSchema,
      401: commonAuthErrorSchema,
    },
    summary: "The signed-in account's own details",
  },
  updateProfile: {
    method: 'PATCH',
    path: '/account/profile',
    body: updateAccountProfileSchema,
    responses: {
      200: accountProfileSchema,
      401: commonAuthErrorSchema,
    },
    summary: "Correct the signed-in account's own name and phone number",
  },
  deleteAccount: {
    method: 'POST',
    path: '/account/delete',
    // A POST with a body rather than DELETE: the request carries the password
    // that authorises it, and a body on DELETE is the kind of thing
    // intermediaries feel free to drop.
    body: deleteAccountSchema,
    responses: {
      200: z.object({ message: z.string() }),
      /** The password did not match. The only refusal the form can act on. */
      400: apiErrorSchema(['wrong-current-password']),
      401: commonAuthErrorSchema,
      /** The last admin. Deleting it would leave nobody able to let anyone in. */
      409: apiErrorSchema(['last-admin']),
    },
    summary: 'Delete your own account, anonymizing it (FR-AUTH-06)',
  },
});
