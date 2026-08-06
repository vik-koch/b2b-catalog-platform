import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  companyRegistrationIdSchema,
  customerTypeSchema,
  userRoleSchema,
} from './auth.contract';

const c = initContract();

/**
 * Account management (FR-AUTH-01/03/04), staff side.
 *
 * The permission split lives in the API's guards, not here, but it is the point
 * of the surface: **admin and manager** decide who is a customer and what they
 * pay (approve, tier); **admin only** decides who is staff (role). A manager
 * who could grant a role could promote themselves.
 */

/**
 * Account lifecycle, mirroring the `user_status` pg enum. `invited` is a real
 * state rather than a derived one: staff have approved the account and a
 * set-your-password link is out, but nothing can sign in until it is redeemed.
 */
export const USER_STATUSES = [
  'pending',
  'invited',
  'active',
  'anonymized',
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const userStatusSchema = z.enum(USER_STATUSES);

/**
 * An account as staff see it. Carries what the approval decision needs — who
 * registered, how to reach them, what they say they are — and never the
 * password hash or anything derived from it.
 */
export const staffUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    role: userRoleSchema,
    status: userStatusSchema,
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    customerType: customerTypeSchema.nullable(),
    /** Stored unmasked; the browser formats it with the deployment's mask. */
    companyRegistrationId: z.string().nullable(),
    /** Null means the base price list, which is a normal, permanent state. */
    tierId: z.string().uuid().nullable(),
    createdAt: z.string().datetime(),
    approvedAt: z.string().datetime().nullable(),
    approvedBy: z.string().uuid().nullable(),
  })
  .strict();
export type StaffUser = z.infer<typeof staffUserSchema>;

/**
 * Approval (FR-AUTH-03). The tier is **required and explicit**: ADR 0031
 * refuses a default tier, so there is nothing to fall back to — `null` is a
 * deliberate choice of the base price list, not an omission.
 */
export const approveUserSchema = z
  .object({ tierId: z.string().uuid().nullable() })
  .strict();
export type ApproveUserRequest = z.infer<typeof approveUserSchema>;

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
    companyRegistrationId: companyRegistrationIdSchema.nullable(),
    /** Null is the base price list — a real choice, not an omission. */
    tierId: z.string().uuid().nullable(),
    role: userRoleSchema.optional(),
  })
  .strict()
  // The same pairing the registration form enforces: a registration number
  // belongs to a company and only to a company.
  .refine(
    (data) =>
      (data.customerType === 'company') === Boolean(data.companyRegistrationId),
    {
      message:
        'A company registration number is required for a company, and only for a company.',
      path: ['companyRegistrationId'],
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
    email: z.string().trim().email().max(320),
    role: userRoleSchema,
    tierId: z.string().uuid().nullable(),
    firstName: z.string().trim().min(1).max(200),
    lastName: z.string().trim().min(1).max(200),
    phone: z.string().trim().max(50).optional(),
    customerType: customerTypeSchema.optional(),
    companyRegistrationId: companyRegistrationIdSchema.optional(),
  })
  .strict();
export type CreateUserRequest = z.infer<typeof createUserSchema>;

/**
 * Which side of the account list a request wants: `customer` accounts (`user`
 * role) or `staff` (admin and manager). The split is a real permission boundary,
 * not just a view — a manager may only ever see customers, enforced server-side
 * regardless of what is asked for (see StaffUsersController).
 */
export const USER_KINDS = ['customer', 'staff'] as const;
export type UserKind = (typeof USER_KINDS)[number];
export const userKindSchema = z.enum(USER_KINDS);

/** Filters for the account list — the admin-grid pattern (FR-ADM-05). */
export const listUsersQuerySchema = z.object({
  kind: userKindSchema.optional(),
  status: userStatusSchema.optional(),
  /** Narrows within `staff` (admin vs manager); customers are all one role. */
  role: userRoleSchema.optional(),
  /** `null` is not expressible in a query string; `default` means the base list. */
  tierId: z.union([z.string().uuid(), z.literal('default')]).optional(),
  /** Matches email, first or last name, or the registration number. */
  q: z.string().trim().max(200).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

const messageSchema = z.object({ message: z.string() });

export const usersContract = c.router(
  {
    listUsers: {
      method: 'GET',
      path: '/admin/users',
      query: listUsersQuerySchema,
      responses: {
        200: z.object({ users: z.array(staffUserSchema) }).strict(),
      },
      summary: 'List accounts, filtered (admin, manager)',
    },
    approveUser: {
      method: 'POST',
      path: '/admin/users/:id/approve',
      pathParams: z.object({ id: z.string().uuid() }),
      body: approveUserSchema,
      responses: {
        200: staffUserSchema,
        404: messageSchema,
        // Only a pending registration can be approved.
        409: messageSchema,
      },
      summary: 'Approve a registration, assign a tier, send the invitation',
    },
    createUser: {
      method: 'POST',
      path: '/admin/users',
      body: createUserSchema,
      responses: {
        201: staffUserSchema,
        // Email already has an account.
        409: messageSchema,
      },
      summary: 'Create an account and invite it (admin, manager)',
    },
    getUser: {
      method: 'GET',
      path: '/admin/users/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      responses: {
        200: staffUserSchema,
        404: messageSchema,
      },
      // The editor is a route, so a reload of it has no list to read from.
      summary: 'One account (admin, manager)',
    },
    updateUser: {
      method: 'PATCH',
      path: '/admin/users/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: updateUserSchema,
      responses: {
        200: staffUserSchema,
        404: messageSchema,
        // Would leave the deployment with no admin, or demote yourself.
        409: messageSchema,
      },
      summary: 'Edit an account; role is admin only (admin, manager)',
    },
    deleteUser: {
      method: 'DELETE',
      path: '/admin/users/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.void(),
      responses: {
        200: messageSchema,
        404: messageSchema,
        // Only an unapproved registration can be deleted outright; an account
        // that has ever been usable is anonymized instead, never removed.
        409: messageSchema,
      },
      summary: 'Decline and purge a pending registration (admin, manager)',
    },
  },
  {
    commonResponses: { 401: messageSchema, 403: messageSchema },
  },
);
