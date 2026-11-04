import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors, phoneFormatErrors } from '../../platform/api-error';
import { customerTypeSchema } from '../../core/accounts/users.contract';
import { userRoleSchema } from '../../platform/session.contract';
import { storedEmailField } from '../../platform/contact-config';

/** The holder's own record: its own shape, not the staff one trimmed, and
 * without `tierId`, which is staff's to assign and not the customer's to see. */
export const accountProfileSchema = z.object({
  email: storedEmailField,
  role: userRoleSchema,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  customerType: customerTypeSchema.nullable(),
  companyName: z.string().nullable(),
  companyRegistrationId: z.string().nullable(),
  /** When the account was registered: the "member since" line. */
  createdAt: z.iso.datetime(),
  /** Orders the shop is still working on (FR-AUTH-06). Deleting the account
   * leaves them standing without the details they were placed with. */
  openOrders: z.number().int().nonnegative(),
  /** The number is staff's to change because sign-in codes go to it
   * (FR-AUTH-12); otherwise the holder corrects it like any field. */
  phoneLocked: z.boolean(),
});
export type AccountProfile = z.infer<typeof accountProfileSchema>;

/** What the holder may correct: their name and number. The email (the login)
 * and the company facts staff approved the account on are staff edits. */
export const updateAccountProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(200),
    lastName: z.string().trim().min(1).max(200),
    /** Null clears it: staff accounts often have none. */
    phone: z.string().trim().min(1).max(50).nullable(),
  })
  // Unknown keys are rejected, not stripped (NFR-SEC-05), so `role` or
  // `tierId` cannot ride along on a self-service write.
  .strict();
export type UpdateAccountProfileRequest = z.infer<
  typeof updateAccountProfileSchema
>;

/** Deleting your own account (FR-AUTH-06) takes the current password: an
 * unlocked laptop should not be enough. */
export const deleteAccountSchema = z
  .object({ password: z.string().min(1) })
  .strict();

/** The signed-in account's own details, whatever its role. */
export const accountContract = {
  getProfile: oc
    .route({
      method: 'GET',
      path: '/account/profile',
      summary: "The signed-in account's own details",
    })
    .errors(commonAuthErrors)
    .output(accountProfileSchema),

  updateProfile: oc
    .route({
      method: 'PATCH',
      path: '/account/profile',
      inputStructure: 'detailed',
      summary: "Correct the signed-in account's own name and phone number",
    })
    .errors({
      ...commonAuthErrors,
      ...phoneFormatErrors,
      /** The number receives sign-in codes, so only staff change it. */
      'phone-locked': { status: 409 },
    })
    .input(z.object({ body: updateAccountProfileSchema }))
    .output(accountProfileSchema),

  deleteAccount: oc
    .route({
      method: 'POST',
      // POST, not DELETE: it carries the password in a body, which
      // intermediaries may drop from a DELETE.
      path: '/account/delete',
      inputStructure: 'detailed',
      summary: 'Delete your own account, anonymizing it (FR-AUTH-06)',
    })
    .errors({
      ...commonAuthErrors,
      /** The password did not match. The only refusal the form can act on. */
      'wrong-current-password': { status: 400 },
      /** The last admin, without whom nobody can let anyone in. */
      'last-admin': { status: 409 },
    })
    .input(z.object({ body: deleteAccountSchema }))
    .output(z.object({ message: z.string() })),
};
