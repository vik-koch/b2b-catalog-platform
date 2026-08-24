import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  companyNameSchema,
  companyRegistrationIdSchema,
} from './contact-format';
import {
  apiErrorSchema,
  COMMON_AUTH_ERROR_CODES,
  commonAuthErrorSchema,
} from './api-error';
import { customerTypeSchema, userRoleSchema } from './auth.contract';

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
 *
 * `disabled` and `anonymized` are the two ways an account stops being usable,
 * and they are not interchangeable: **disabled** is a switch staff can flip
 * back (the colleague who left, the customer who stopped ordering) and keeps
 * the person's name, so the audit trail and every `approvedBy` reference still
 * name somebody; **anonymized** erases who they were and is final.
 *
 * Switching an account off retires its password, so the way back on is
 * `invited` — never straight to `active`. That keeps every status honest about
 * one thing: an account is `active` exactly when it holds a password its owner
 * chose.
 */
export const USER_STATUSES = [
  'pending',
  'invited',
  'active',
  'disabled',
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
    /** The invoiced party, as the account was approved on it. */
    companyName: z.string().nullable(),
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
    companyName: companyNameSchema.nullable(),
    companyRegistrationId: companyRegistrationIdSchema.nullable(),
    /** Null is the base price list — a real choice, not an omission. */
    tierId: z.string().uuid().nullable(),
    role: userRoleSchema.optional(),
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
    email: z.string().trim().email().max(320),
    role: userRoleSchema,
    tierId: z.string().uuid().nullable(),
    firstName: z.string().trim().min(1).max(200),
    lastName: z.string().trim().min(1).max(200),
    phone: z.string().trim().max(50).optional(),
    customerType: customerTypeSchema.optional(),
    companyName: companyNameSchema.optional(),
    companyRegistrationId: companyRegistrationIdSchema.optional(),
  })
  .strict();
export type CreateUserRequest = z.infer<typeof createUserSchema>;

/**
 * Switching an account off, and back on again (FR-AUTH-04). A lifecycle
 * transition rather than a field, which is why it is not part of `updateUser`:
 * it ends sessions, retires the password, and the two directions are separate
 * decisions with separate audit lines.
 *
 * The request names the *direction*, not a target status, because switching
 * back on does not land where the account came from: it lands on `invited`,
 * with a fresh set-your-password link out. The response says where it actually
 * ended up.
 */
export const setUserActiveSchema = z.object({ active: z.boolean() }).strict();
export type SetUserActiveRequest = z.infer<typeof setUserActiveSchema>;

/**
 * Which side of the account list a request wants: `customer` accounts (`user`
 * role) or `staff` (admin and manager). The split is a real permission boundary,
 * not just a view — a manager may only ever see customers, enforced server-side
 * regardless of what is asked for (see StaffUsersController).
 */
export const USER_KINDS = ['customer', 'staff'] as const;
export type UserKind = (typeof USER_KINDS)[number];
export const userKindSchema = z.enum(USER_KINDS);

/**
 * The account-list filter value meaning "no registration number at all" —
 * in practice, the private persons. Reserved rather than derived: it sits in
 * the same parameter as the `companyIdInput.formats` keys, so a deployment must
 * not use it as one.
 */
export const COMPANY_ID_NONE = 'none';

/** Filters for the account list — the admin-grid pattern (FR-ADM-05). */
export const listUsersQuerySchema = z.object({
  kind: userKindSchema.optional(),
  status: userStatusSchema.optional(),
  /** Narrows within `staff` (admin vs manager); customers are all one role. */
  role: userRoleSchema.optional(),
  /** `null` is not expressible in a query string; `default` means the base list. */
  tierId: z.union([z.string().uuid(), z.literal('default')]).optional(),
  /**
   * A `companyIdInput.formats` key: the accounts whose registration number is
   * in that shape. Which keys exist is deployment config, so this is a plain
   * string — an unknown one matches nothing, which is the honest answer for a
   * format this deployment does not have. `COMPANY_ID_NONE` is the one value
   * that is not a key: accounts carrying no number at all.
   */
  companyIdFormat: z.string().trim().max(64).optional(),
  /** Matches email, first or last name, or the registration number. */
  q: z.string().trim().max(200).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/**
 * Why a staff account action was refused. Each one is a sentence the account
 * list or the editor puts on screen, so the set is closed and every code has a
 * matching line in the admin text.
 */
export const USER_ERROR_CODES = [
  /** Unknown — or staff seen by a manager, which is the same answer here. */
  'account-not-found',
  'account-not-pending',
  'account-closed',
  'email-taken',
  /** Only an `active` or `invited` account can be switched off. */
  'account-not-approved',
  'account-not-disabled',
  /** Nothing to invite: a password has already been chosen. */
  'account-not-invited',
  'self-deactivate',
  'self-demote',
  'last-admin',
  /** Approved accounts are anonymized, never deleted. */
  'account-not-purgeable',
] as const;
export type UserErrorCode = (typeof USER_ERROR_CODES)[number];
const userErrorSchema = apiErrorSchema(USER_ERROR_CODES);

/**
 * The two things a manager may not do, both about who decides who is staff.
 * Their own 403 codes rather than the shared `insufficient-role`, because these
 * two do reach a screen: the editor shows them next to the field that was
 * refused, where a redirect to "not for you" would lose the whole edit.
 */
export const USER_FORBIDDEN_CODES = [
  ...COMMON_AUTH_ERROR_CODES,
  'role-change-admin-only',
  'staff-create-admin-only',
] as const;
export type UserForbiddenCode = (typeof USER_FORBIDDEN_CODES)[number];

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
        404: userErrorSchema,
        // Only a pending registration can be approved.
        409: userErrorSchema,
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
        409: userErrorSchema,
      },
      summary: 'Create an account and invite it (admin, manager)',
    },
    getUser: {
      method: 'GET',
      path: '/admin/users/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      responses: {
        200: staffUserSchema,
        404: userErrorSchema,
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
        404: userErrorSchema,
        // Would leave the deployment with no admin, or demote yourself.
        409: userErrorSchema,
      },
      summary: 'Edit an account; role is admin only (admin, manager)',
    },
    setUserActive: {
      method: 'PATCH',
      path: '/admin/users/:id/active',
      pathParams: z.object({ id: z.string().uuid() }),
      body: setUserActiveSchema,
      responses: {
        200: staffUserSchema,
        404: userErrorSchema,
        // Your own account, the last admin, a registration nobody has decided
        // on yet, or an anonymized one — which has nothing left to switch on.
        409: userErrorSchema,
      },
      summary: 'Deactivate or reactivate an account (admin, manager)',
    },
    resendInvitation: {
      method: 'POST',
      path: '/admin/users/:id/invite',
      pathParams: z.object({ id: z.string().uuid() }),
      // No payload; an empty object is the repo's no-body POST convention
      // (a POST body is parsed to `{}`, which `z.void()` would reject).
      body: z.object({}),
      responses: {
        200: z.object({ message: z.string() }),
        404: userErrorSchema,
        // Nothing to send to: a pending, disabled or anonymized account.
        409: userErrorSchema,
      },
      // The first link expires, and mail gets lost; this is the way back
      // without touching the account itself.
      summary: 'Send a fresh set-your-password link (admin, manager)',
    },
    deleteUser: {
      method: 'DELETE',
      path: '/admin/users/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.void(),
      responses: {
        200: z.object({ message: z.string() }),
        404: userErrorSchema,
        // Only an unapproved registration can be deleted outright; an account
        // that has ever been usable is anonymized instead, never removed.
        409: userErrorSchema,
      },
      summary: 'Decline and purge a pending registration (admin, manager)',
    },
  },
  {
    commonResponses: {
      401: commonAuthErrorSchema,
      403: apiErrorSchema(USER_FORBIDDEN_CODES),
    },
  },
);
