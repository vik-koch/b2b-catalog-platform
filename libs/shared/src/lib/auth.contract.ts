import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { addressComponentsSchema } from './address.contract';
import { partyEntityTypeSchema } from './party.contract';
import {
  companyNameSchema,
  companyRegistrationIdSchema,
} from './contact-format';
import { apiErrorSchema, commonAuthErrorSchema } from './api-error';

const c = initContract();

/**
 * Name of the httpOnly cookie carrying the session JWT. Shared because it is
 * not only the API's business: the SSR tier looks for it by name to tell
 * whether the visitor it is rendering for has a session at all (it never reads
 * the value — it cannot, and does not need to).
 */
export const AUTH_COOKIE = 'session';

/**
 * Name of the readable companion to `AUTH_COOKIE`, carrying the signed-in
 * role and nothing else.
 *
 * It exists so the *browser* can answer "is anyone signed in, and as what?"
 * before `/auth/me` does — the session cookie is httpOnly and unreadable by
 * page script, which is what left the navbar's account control guessing on
 * every cold load. It is written and cleared in the same responses as the
 * session cookie, with the same attributes and lifetime, so the two can only
 * disagree when a live session is invalidated server-side.
 *
 * It is a **rendering hint, never an authorization**. Anyone can edit it; the
 * API verifies the JWT and the database role on every request, and the worst a
 * forged value buys is a navbar link to a page that answers 403.
 */
export const SESSION_HINT_COOKIE = 'session_role';

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
   * Enough to greet the account holder by name, and nothing more — the rest of
   * their record is the account profile's job. Null on accounts nobody
   * registered (the bootstrap admin, staff created before the field existed),
   * so every consumer falls back to the address.
   */
  firstName: z.string().nullable(),
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
 * Length is the only password rule this contract carries, so the browser can
 * check the same floor the server does. Twelve rather than eight because
 * length is what actually resists guessing; there are deliberately **no**
 * composition rules (a digit, a symbol, a capital), which NIST 800-63B
 * recommends against — they produce predictable passwords like `Passwort1!`
 * without making them harder to guess.
 *
 * What replaces them is server-side and cannot live here: a blocklist of
 * common passwords, and a refusal of anything containing the account's own
 * address or the shop's name (see PasswordPolicy).
 */
export const PASSWORD_MIN_LENGTH = 12;
export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(200);

/**
 * Why the server refused a password. One code per rule in PasswordPolicy, so
 * the form can say what is actually wrong — somebody who typed their own email
 * address is told that, not "invalid password" — while the wording stays in the
 * deployment's own text file.
 *
 * Length is absent on purpose: it is in `newPasswordSchema`, so the form
 * refuses a short password before there is a request to answer.
 */
export const PASSWORD_REJECTION_CODES = [
  'password-common',
  'password-predictable',
  'password-contains-email',
  'password-contains-shop-name',
  /** Only reachable from a password *change*, which knows the old one. */
  'password-unchanged',
] as const;
export type PasswordRejectionCode = (typeof PASSWORD_REJECTION_CODES)[number];

/**
 * A set-a-password link that is no good. Unknown, already used and expired are
 * deliberately one code, as they are one answer.
 */
export const PASSWORD_TOKEN_INVALID = 'password-token-invalid' as const;

/**
 * Redeeming a set-a-password link (FR-AUTH-01/02). The token is the whole
 * credential — it arrived by mail and is single-use — so nothing else is asked
 * for, not even the address it belongs to.
 */
export const setPasswordSchema = z
  .object({
    token: z.string().min(1).max(200),
    password: newPasswordSchema,
  })
  .strict();
export type SetPasswordRequest = z.infer<typeof setPasswordSchema>;

/**
 * What a valid link is *for*, derived from the account's state rather than
 * stored on the token: `set` for an account that has never had a password,
 * `reset` for one replacing the password it has.
 */
export const passwordTokenPurposeSchema = z.enum(['set', 'reset']);
export type PasswordTokenPurpose = z.infer<typeof passwordTokenPurposeSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: newPasswordSchema,
  })
  .strict();
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

/**
 * Asking for a reset link (FR-AUTH-02). An address and nothing else — there is
 * nothing to prove yet, and the proof is that the mail arrives.
 */
export const forgotPasswordSchema = z
  .object({ email: z.string().trim().email().max(320) })
  .strict();
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordSchema>;

/** What kind of customer is registering. Kept in sync with the `customer_type` pg enum. */
export const CUSTOMER_TYPES = ['person', 'company'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const customerTypeSchema = z.enum(CUSTOMER_TYPES);

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
    companyName: companyNameSchema.optional(),
    companyRegistrationId: companyRegistrationIdSchema.optional(),
    /**
     * The registered address of the company the registrant **picked** from a
     * suggestion (FR-AUTH-10), which becomes the account's first saved address.
     * From the browser rather than a second lookup: it is the row they chose,
     * it cannot go stale between choosing and approving, and it costs no
     * further call at a metered provider.
     *
     * Optional in every sense — a registration without it is ordinary, the
     * server takes it only when it is complete enough to be an address, and
     * nothing about the account depends on one having arrived.
     */
    billingAddress: addressComponentsSchema
      .extend({
        /**
         * Carried so the server can apply the rule rather than trusting the
         * form to have applied it: an address is seeded only for a legal
         * entity, because an individual entrepreneur's registered address is
         * their home.
         */
        entityType: partyEntityTypeSchema,
      })
      .optional(),
    website: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.string().max(2000).optional(),
    ),
  })
  // strict: unknown keys are rejected, not stripped (NFR-SEC-05).
  .strict()
  // A company is identified by its name *and* its registration number, so both
  // are required exactly when the registrant says they are one — and refused
  // when they do not, rather than being silently stored against a private
  // person. Staff need both to judge the request: a number alone is a lookup,
  // and a name alone is not evidence of anything.
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
      // The one thing a registration is told outright. The number's format is
      // deployment config, so the browser checks the same rule and this is the
      // server having the last word — and unlike an address that already has an
      // account, a bad format reveals nothing about anyone.
      400: apiErrorSchema(['company-id-format']),
    },
    summary: 'Request an account (creates a pending registration)',
  },
  forgotPassword: {
    method: 'POST',
    path: '/auth/forgot-password',
    body: forgotPasswordSchema,
    responses: {
      // The same answer for an address with an account, one without, and one
      // whose account may not sign in — for the same reason `register` gives
      // one answer: this form must not become a way to test which addresses
      // are customers. What happened is explained by mail, to the address.
      200: z.object({ ok: z.literal(true) }),
    },
    summary: 'Ask for a password-reset link (FR-AUTH-02)',
  },
  checkPasswordToken: {
    method: 'GET',
    path: '/auth/password-token/:token',
    pathParams: z.object({ token: z.string() }),
    responses: {
      200: z
        .object({
          purpose: passwordTokenPurposeSchema,
          /** Shown so the visitor sees which account they are setting up. */
          email: z.string().email(),
        })
        .strict(),
      404: apiErrorSchema([PASSWORD_TOKEN_INVALID]),
    },
    summary: 'Check a set-a-password link before showing the form',
  },
  setPassword: {
    method: 'POST',
    path: '/auth/set-password',
    body: setPasswordSchema,
    responses: {
      // Signs the visitor in: they have just proved control of the address and
      // chosen a password, so a login form here would be ceremony.
      200: authUserSchema,
      // The password was refused by the policy; the code says which rule.
      400: apiErrorSchema(PASSWORD_REJECTION_CODES),
      404: apiErrorSchema([PASSWORD_TOKEN_INVALID]),
    },
    summary: 'Redeem a link and set the account password',
  },
  login: {
    method: 'POST',
    path: '/auth/login',
    body: loginSchema,
    responses: {
      200: authUserSchema,
      // Deliberately one code for a wrong address, a wrong password and an
      // account that may not sign in: the form says the same thing to all three.
      401: apiErrorSchema(['invalid-credentials']),
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
      401: commonAuthErrorSchema,
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
      // Two different kinds of 400, told apart by `code` rather than by the
      // client guessing: the current password was wrong, or the *new* one was
      // refused by the policy — and in that case which rule refused it.
      400: apiErrorSchema([
        'wrong-current-password',
        ...PASSWORD_REJECTION_CODES,
      ]),
      401: commonAuthErrorSchema,
    },
    summary: "Change the current user's password",
  },
});
