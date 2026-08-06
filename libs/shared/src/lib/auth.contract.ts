import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/**
 * Authorization roles.
 * Kept in sync with the `user_role` pg enum in the API schema.
 */
export const USER_ROLES = ['admin', 'manager', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

/**
 * The authenticated identity exposed to the client. Never carries the password
 * hash, and never a pricing tier — role is authorization only.
 */
export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: userRoleSchema,
  /**
   * The account still carries a password it did not choose itself — the
   * bootstrap admin's seeded one (FR-AUTH-07). The client uses it to force the
   * change-password prompt.
   */
  mustChangePassword: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

// strict: unknown keys are rejected, not stripped (NFR-SEC-05).
export const loginSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(1),
  })
  .strict();
export type LoginRequest = z.infer<typeof loginSchema>;

/**
 * Minimum length is the one password rule we enforce; argon2 handles the rest.
 * Named and exported so the change-password form validates the very rule the
 * server applies (see zodValidator) instead of a hand-copied near-match.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(200);

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: newPasswordSchema,
  })
  .strict();
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

/** What kind of customer is registering. Kept in sync with the `customer_type` pg enum. */
export const CUSTOMER_TYPES = ['person', 'company'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const customerTypeSchema = z.enum(CUSTOMER_TYPES);

/**
 * A company's business registration number. The *format* is jurisdiction-
 * specific and therefore deployment configuration (`companyIdInput.pattern` in
 * deployment.json), not something this contract can know — so all it enforces
 * is the envelope. The value travels unmasked; the deployment's own pattern is
 * applied on top, on both sides.
 */
export const companyRegistrationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9-]+$/);

/**
 * Registration (FR-AUTH-01). A registration is a *request* to become a
 * customer, and staff have no way to ask the applicant anything — a pending
 * account cannot sign in — so it has to carry what makes the approval decision
 * possible: who this is, how to reach them to verify it, and, for a business,
 * the registration number staff match against their own records.
 *
 * What it deliberately does not carry: a tier (staff assign it on approval, ADR
 * 0031) and any delivery detail (that belongs to an order, not an account).
 * `website` is the honeypot the real form hides from humans.
 */
export const registerSchema = z
  .object({
    email: z.string().trim().email().max(320),
    firstName: z.string().trim().min(1).max(200),
    lastName: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(1).max(50),
    customerType: customerTypeSchema,
    companyRegistrationId: companyRegistrationIdSchema.optional(),
    website: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.string().max(2000).optional(),
    ),
  })
  // strict: unknown keys are rejected, not stripped (NFR-SEC-05).
  .strict()
  // A company is identified by its registration number, so it is required
  // exactly when the registrant says they are one — and refused when they do
  // not, rather than being silently stored against a private person.
  .refine(
    (data) =>
      (data.customerType === 'company') === Boolean(data.companyRegistrationId),
    {
      message:
        'A company registration number is required for a company, and only for a company.',
      path: ['companyRegistrationId'],
    },
  );
export type RegisterRequest = z.infer<typeof registerSchema>;

/**
 * Session auth. Login/logout manage an httpOnly session cookie set
 * by the server, so the token never touches client JavaScript; the contract
 * carries only the user identity, not the token.
 */
export const authContract = c.router({
  register: {
    method: 'POST',
    path: '/auth/register',
    body: registerSchema,
    responses: {
      // Always the same answer, whether the address was new, already
      // registered, or a honeypot hit: the response must not reveal which
      // addresses have accounts. What actually happened is explained by mail,
      // to the address itself.
      200: z.object({ ok: z.literal(true) }),
    },
    summary: 'Request an account (creates a pending registration)',
  },
  login: {
    method: 'POST',
    path: '/auth/login',
    body: loginSchema,
    responses: {
      200: authUserSchema,
      401: z.object({ message: z.string() }),
    },
    summary: 'Authenticate and start a session (sets an httpOnly cookie)',
  },
  logout: {
    method: 'POST',
    path: '/auth/logout',
    // Idempotent and safe to call unauthenticated — it only clears the cookie.
    body: z.object({}),
    responses: {
      200: z.object({ message: z.string() }),
    },
    summary: 'Clear the session cookie',
  },
  me: {
    method: 'GET',
    path: '/auth/me',
    responses: {
      200: authUserSchema,
      401: z.object({ message: z.string() }),
    },
    summary: 'Return the currently authenticated user',
  },
  changePassword: {
    method: 'POST',
    path: '/auth/change-password',
    body: changePasswordSchema,
    responses: {
      // The refreshed identity (with mustChangePassword cleared), so the client
      // updates its session state from the response rather than re-fetching.
      200: authUserSchema,
      400: z.object({ message: z.string() }),
      401: z.object({ message: z.string() }),
    },
    summary: "Change the current user's password",
  },
});
