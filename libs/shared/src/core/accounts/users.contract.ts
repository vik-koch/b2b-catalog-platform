import * as z from 'zod';
import {
  ACCOUNT_DELETION_REASONS,
  CUSTOMER_TYPES,
  USER_KINDS,
  USER_STATUSES,
} from './users';
import {
  companyNameSchema,
  companyRegistrationIdSchema,
  emailField,
  storedEmailField,
} from '../../platform/contact-config';
import { userRoleSchema } from '../../platform/session.contract';

/**
 * An account as staff and the customer exchange act on it: the shape they
 * read, and the writes that create, change and delete one.
 */

export const customerTypeSchema = z.enum(CUSTOMER_TYPES);

export type UserStatus = (typeof USER_STATUSES)[number];
export const userStatusSchema = z.enum(USER_STATUSES);

/** An account as staff see it: what the approval decision needs, never the
 * password hash or anything derived from it. */
export const staffUserSchema = z
  .object({
    id: z.uuid(),
    email: storedEmailField,
    /** The source system's key (FR-ADM-14), or null where no run claimed the
     * account, which the exchange then cannot see. Staff-facing only. */
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
    /** When an admin exempted the account from the code, and their address,
     * kept when that admin's account is later deleted. */
    signInStepExemptAt: z.iso.datetime().nullable(),
    signInStepExemptBy: z.string().nullable(),
  })
  .strict();
export type StaffUser = z.infer<typeof staffUserSchema>;

/**
 * Editing an account (FR-AUTH-04): the whole editable set in one request, as
 * it is one screen. No `email`: it is the login, and changing it is recovery.
 * `role` and `sourceId` are optional because a manager may not send them, and
 * the API refuses rather than drops them.
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
    /** Null is the base price list: a real choice, not an omission. */
    tierId: z.uuid().nullable(),
    role: userRoleSchema.optional(),
    /** The source key (FR-ADM-14), set by hand where a run's claim cannot
     * (FR-ADM-17). Admin only, and only while no external system owns customers. */
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

/** An account staff create themselves. It starts `invited` and chooses its own
 * password, as an approved registration does. */
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
