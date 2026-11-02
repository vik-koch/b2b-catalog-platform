import * as z from 'zod';
import {
  ACCOUNT_DELETION_REASONS,
  USER_KINDS,
  USER_STATUSES,
} from './user-constants';
import {
  companyNameSchema,
  companyRegistrationIdSchema,
  emailField,
  storedEmailField,
} from '../config/contact-config';
import { customerTypeSchema } from './auth.contract';
import { userRoleSchema } from '../../platform/session.contract';

/**
 * An account as staff and the customer exchange act on it: the shape they
 * read, and the writes that create, change and delete one.
 */

export type UserStatus = (typeof USER_STATUSES)[number];
export const userStatusSchema = z.enum(USER_STATUSES);

/**
 * An account as staff see it. Carries what the approval decision needs — who
 * registered, how to reach them, what they say they are — and never the
 * password hash or anything derived from it.
 */
export const staffUserSchema = z
  .object({
    id: z.uuid(),
    email: storedEmailField,
    /**
     * The source system's own key for this customer (FR-ADM-14), or null for
     * everyone who registered here and was never claimed by a run — which is
     * everyone, on a deployment that exchanges nothing.
     *
     * Staff-facing and never serialized to the storefront, exactly as a
     * product's is. It is here because an account whose key is null is an
     * account the exchange cannot see at all, and a screen that does not show
     * the field cannot tell anybody that is why.
     */
    sourceId: z.string().nullable(),
    role: userRoleSchema,
    status: userStatusSchema,
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    customerType: customerTypeSchema.nullable(),
    /** The invoiced party, as the account was approved on it. */
    companyName: z.string().nullable(),
    companyRegistrationId: z.string().nullable(),
    /** Null means the base price list, which is a normal, permanent state. */
    tierId: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
    approvedAt: z.iso.datetime().nullable(),
    approvedBy: z.uuid().nullable(),
    /** When the holder last entered a code sent to `phone` (FR-AUTH-12). */
    phoneConfirmedAt: z.iso.datetime().nullable(),
    /**
     * Exempt from the code after the password, set by an admin, and who that
     * was. The address is read beside the id because a staff screen names a
     * person, and it is kept when that admin's account is later deleted.
     */
    signInStepExemptAt: z.iso.datetime().nullable(),
    signInStepExemptBy: z.string().nullable(),
  })
  .strict();
export type StaffUser = z.infer<typeof staffUserSchema>;

/**
 * Editing an account (FR-AUTH-04). One request for the whole editable set,
 * because it is one screen: a manager correcting a mistyped digit and re-tiering
 * the same customer is a single decision, and two endpoints would make it two
 * requests with a half-applied state in between.
 *
 * **`email` is absent by design** — it is the login and the identity the audit
 * trail points at, so changing it is an account-recovery flow (with a
 * confirmation to the new address), not a field edit.
 *
 * `role` is optional because it is the one field a *manager* may not touch: the
 * API rejects it from anyone but an admin rather than silently ignoring it, so
 * a refused change is never mistaken for a saved one.
 */
export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(200),
    lastName: z.string().trim().min(1).max(200),
    /** Null clears it; staff accounts often have none. */
    phone: z.string().trim().max(50).nullable(),
    customerType: customerTypeSchema.nullable(),
    companyName: companyNameSchema.nullable(),
    companyRegistrationId: companyRegistrationIdSchema.nullable(),
    /** Null is the base price list — a real choice, not an omission. */
    tierId: z.uuid().nullable(),
    role: userRoleSchema.optional(),
    /**
     * The source key (FR-ADM-14). Optional for the reason `role` is: it is a
     * field a *manager* may not touch, and the API refuses it from one rather
     * than dropping it, so a refused change is never mistaken for a saved one.
     *
     * The manual way to give a self-registered account its key, and the escape
     * hatch behind the run-level claim (FR-ADM-17): it needs an admin, and it
     * needs the area handed back first, since every write to a customer account
     * is refused while an external system owns them.
     */
    sourceId: z.string().trim().min(1).max(255).nullable().optional(),
  })
  .strict()
  // The same pairing the registration form enforces: a name and a number
  // belong to a company and only to a company.
  .refine(
    (data) =>
      (data.customerType === 'company') === Boolean(data.companyRegistrationId),
    {
      message:
        'A company ID is required for a company, and only for a company.',
      path: ['companyRegistrationId'],
    },
  )
  .refine(
    (data) => (data.customerType === 'company') === Boolean(data.companyName),
    {
      message:
        'A company name is required for a company, and only for a company.',
      path: ['companyName'],
    },
  );
export type UpdateUserRequest = z.infer<typeof updateUserSchema>;

/**
 * An account staff create themselves — a colleague, or a customer who
 * negotiated by phone and never used the form. No password is set here and
 * none is mailed: the account is `invited` and chooses its own, exactly like an
 * approved registration.
 */
export const createUserSchema = z
  .object({
    email: emailField(320),
    role: userRoleSchema,
    tierId: z.uuid().nullable(),
    firstName: z.string().trim().min(1).max(200),
    lastName: z.string().trim().min(1).max(200),
    phone: z.string().trim().max(50).optional(),
    customerType: customerTypeSchema.optional(),
    companyName: companyNameSchema.optional(),
    companyRegistrationId: companyRegistrationIdSchema.optional(),
    sourceId: z.string().trim().min(1).max(255).nullable().optional(),
  })
  .strict();
export type CreateUserRequest = z.infer<typeof createUserSchema>;

export const accountDeletionReasonSchema = z.enum(ACCOUNT_DELETION_REASONS);
export type AccountDeletionReason = z.infer<typeof accountDeletionReasonSchema>;
export const deleteAccountOnRequestSchema = z
  .object({ reason: accountDeletionReasonSchema })
  .strict();

export type UserKind = (typeof USER_KINDS)[number];
export const userKindSchema = z.enum(USER_KINDS);
