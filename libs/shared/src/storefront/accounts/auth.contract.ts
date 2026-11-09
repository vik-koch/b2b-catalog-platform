import { oc } from '@orpc/contract';
import * as z from 'zod';

import { addressComponentsSchema } from '../../core/accounts/address.contract';
import {
  MAINTENANCE_REFUSED,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOKEN_INVALID,
  PasswordRejectionCode,
  SIGN_IN_CODE_LENGTH,
} from '../../core/accounts/auth';
import { partyEntityTypeSchema } from '../../core/accounts/party.contract';
import { signInStepSchema } from '../../core/accounts/sign-in-step.contract';
import { customerTypeSchema } from '../../core/accounts/users.contract';
import { consentVersionField } from '../../core/site/page.contract';
import { consentErrors } from '../../core/site/pages';
import { commonAuthErrors, phoneFormatErrors } from '../../platform/api-error';
import {
  companyNameSchema,
  companyRegistrationIdSchema,
  emailField,
  personNameField,
  storedEmailField,
} from '../../platform/contact-config';
import { honeypotField } from '../../platform/form-fields.contract';
import { authUserSchema } from '../../platform/session.contract';

/** A session, or the step that stands before one. */
export const sessionOrStepSchema = z.union([signInStepSchema, authUserSchema]);

export const signInCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .regex(new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`)),
    /** Remember this browser, where the step offered it. */
    remember: z.boolean().optional(),
  })
  .strict();

/** Asking whether the call has come. `remember` counts once it has. */
export const signInCallSchema = z
  .object({ remember: z.boolean().optional() })
  .strict();

/** The call has not come yet; ask again in a few seconds. */
export const callWaitingSchema = z
  .object({ waiting: z.literal(true) })
  .strict();

// strict: unknown keys are rejected, not stripped (NFR-SEC-05).
export const loginSchema = z
  .object({
    email: emailField,
    password: z.string().min(1),
  })
  .strict();
export type LoginRequest = z.infer<typeof loginSchema>;

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

/** Redeeming a set-a-password link (FR-AUTH-01/02). The single-use token is
 * the whole credential, so nothing else is asked for. */
export const setPasswordSchema = z
  .object({
    token: z.string().min(1).max(200),
    password: newPasswordSchema,
    /** Where the link check said the account consent is still owed. */
    consentVersion: consentVersionField,
  })
  .strict();
export type SetPasswordRequest = z.infer<typeof setPasswordSchema>;

/** What a valid link is for, read off the account rather than the token:
 * `set` where it never had a password, `reset` where it replaces one. */
export const passwordTokenPurposeSchema = z.enum(['set', 'reset']);
export type PasswordTokenPurpose = z.infer<typeof passwordTokenPurposeSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: newPasswordSchema,
  })
  .strict();
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

/** Asking for a reset link (FR-AUTH-02): the address alone, as the proof is
 * that the mail arrives. */
export const forgotPasswordSchema = z.object({ email: emailField }).strict();

/**
 * Registration (FR-AUTH-01): a request to become a customer, carrying what
 * staff decide it on, as a pending account cannot be asked anything. No tier
 * (staff assign it) and no delivery detail (an order's). `website` is the
 * honeypot.
 */
export const registerSchema = z
  .object({
    email: emailField,
    firstName: personNameField,
    lastName: personNameField,
    phone: z.string().trim().min(1).max(50),
    customerType: customerTypeSchema,
    companyName: companyNameSchema.optional(),
    companyRegistrationId: companyRegistrationIdSchema.optional(),
    /** The registered address of the company picked from a suggestion
     * (FR-AUTH-10), seeding the first saved address where it is complete. Sent
     * by the browser: it is the row they chose, and a second lookup is paid. */
    billingAddress: addressComponentsSchema
      .extend({
        /** So the server applies the rule itself: only a legal entity's address
         * is seeded. */
        entityType: partyEntityTypeSchema,
      })
      .optional(),
    website: honeypotField,
    consentVersion: consentVersionField,
  })
  // strict: unknown keys are rejected, not stripped (NFR-SEC-05).
  .strict()
  // A name and a number exactly when the registrant is a company: staff need
  // both to judge the request, and a private person stores neither.
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
 * The password policy's refusals, all 400s: the rule that refused is the whole
 * message, and the form shows its own wording for each.
 */
const passwordRejections = {
  'password-common': { status: 400 },
  'password-predictable': { status: 400 },
  'password-contains-email': { status: 400 },
  'password-contains-shop-name': { status: 400 },
  'password-unchanged': { status: 400 },
} as const satisfies Record<PasswordRejectionCode, { status: number }>;

/**
 * The step's refusals. `sign-in-step-expired` covers a pending sign-in that is
 * missing, stale or for an account that changed meanwhile: the visitor starts
 * again from the password. `code-expired` is a code past its time or its
 * attempts; `code-resend-limit` a resend asked too soon or too often.
 */
const signInStepExpired = {
  'sign-in-step-expired': { status: 401 },
} as const;
export const codeDeliveryErrors = {
  'phone-unreachable': { status: 400 },
  'code-delivery-unavailable': { status: 503 },
  /** Seconds until the account may be sent another code. */
  'code-resend-limit': {
    status: 429,
    data: z.object({ retryAfter: z.number().int().nonnegative() }),
  },
} as const;

/** An entered code: wrong, with the tries it has left, or no longer usable. */
export const codeCheckErrors = {
  'code-wrong': {
    status: 400,
    data: z.object({ attemptsLeft: z.number().int().nonnegative() }),
  },
  'code-expired': { status: 410 },
} as const;

/** A call check that is over without a call: past its time, or ended by the
 * provider. A new one is asked for like a new code. */
export const callCheckErrors = {
  'call-expired': { status: 410 },
  'code-delivery-unavailable': { status: 503 },
} as const;

/** A set-a-password link that is no good: unknown, used and expired alike. */
const badToken = { [PASSWORD_TOKEN_INVALID]: { status: 404 } } as const;

/**
 * A customer's way in while maintenance mode is on. Only told once the
 * credentials (or the link) have proved whose account it is, so it reveals
 * nothing the right answer would not.
 */
const closedForMaintenance = {
  [MAINTENANCE_REFUSED]: { status: 503 },
} as const;

export const authContract = {
  register: oc
    .route({
      method: 'POST',
      path: '/auth/register',
      inputStructure: 'detailed',
      summary: 'Request an account (creates a pending registration)',
    })
    // The one thing a registration is told outright: a bad number format
    // reveals nothing about anyone, unlike an address already registered.
    .errors({
      'company-id-format': { status: 400 },
      // A kind of customer the shop does not sell to (FR-AUTH-13). The form
      // offers none, so only a request built past it gets here.
      'customer-type-not-accepted': { status: 400 },
      ...phoneFormatErrors,
      ...consentErrors,
    })
    .input(z.object({ body: registerSchema }))
    // Always the same answer, whether the address was new, already registered,
    // or a honeypot hit: the response must not reveal which addresses have
    // accounts. What actually happened is explained by mail, to the address.
    .output(z.object({ ok: z.literal(true) })),

  forgotPassword: oc
    .route({
      method: 'POST',
      path: '/auth/forgot-password',
      inputStructure: 'detailed',
      summary: 'Ask for a password-reset link (FR-AUTH-02)',
    })
    .input(z.object({ body: forgotPasswordSchema }))
    // One answer for any address, like `register`, so nobody can probe which
    // are customers. The mail to the address explains.
    .output(z.object({ ok: z.literal(true) })),

  checkPasswordToken: oc
    .route({
      method: 'GET',
      path: '/auth/password-token/{token}',
      inputStructure: 'detailed',
      summary: 'Check a set-a-password link before showing the form',
    })
    .errors({ ...badToken, ...closedForMaintenance })
    .input(z.object({ params: z.object({ token: z.string() }) }))
    .output(
      z
        .object({
          purpose: passwordTokenPurposeSchema,
          /** Shown so the visitor sees which account they are setting up. */
          email: storedEmailField,
          /**
           * The account consent is owed on this form (NFR-LEGAL-09): a
           * customer's first password, while the deployment asks for it and
           * the account has not given it yet.
           */
          consentRequired: z.boolean(),
        })
        .strict(),
    ),

  setPassword: oc
    .route({
      method: 'POST',
      path: '/auth/set-password',
      inputStructure: 'detailed',
      summary: 'Redeem a link and set the account password',
    })
    .errors({
      ...passwordRejections,
      ...badToken,
      ...closedForMaintenance,
      ...consentErrors,
      ...codeDeliveryErrors,
    })
    .input(z.object({ body: setPasswordSchema }))
    // Signs the visitor in, as they just proved the address and chose a
    // password; where the deployment asks for a code, it comes first.
    .output(sessionOrStepSchema),

  login: oc
    .route({
      method: 'POST',
      path: '/auth/login',
      inputStructure: 'detailed',
      summary: 'Authenticate and start a session (sets an httpOnly cookie)',
    })
    // Deliberately one code for a wrong address, a wrong password and an
    // account that may not sign in: the form says the same thing to all three.
    .errors({
      'invalid-credentials': { status: 401 },
      ...closedForMaintenance,
      ...codeDeliveryErrors,
    })
    .input(z.object({ body: loginSchema }))
    .output(sessionOrStepSchema),

  resendSignInCode: oc
    .route({
      method: 'POST',
      path: '/auth/sign-in-step/resend',
      summary: 'Send the pending sign-in a new code, or start a new call check',
    })
    .errors({ ...signInStepExpired, ...codeDeliveryErrors })
    .output(signInStepSchema),

  submitSignInCode: oc
    .route({
      method: 'POST',
      path: '/auth/sign-in-step/code',
      inputStructure: 'detailed',
      summary: 'Enter the code and start the session',
    })
    .errors({
      ...signInStepExpired,
      ...closedForMaintenance,
      ...codeCheckErrors,
    })
    .input(z.object({ body: signInCodeSchema }))
    .output(authUserSchema),

  checkSignInCall: oc
    .route({
      method: 'POST',
      path: '/auth/sign-in-step/call',
      inputStructure: 'detailed',
      summary:
        'Ask whether the call has come, and start the session once it has',
    })
    .errors({
      ...signInStepExpired,
      ...closedForMaintenance,
      ...callCheckErrors,
    })
    .input(z.object({ body: signInCallSchema }))
    .output(z.union([callWaitingSchema, authUserSchema])),

  changePassword: oc
    .route({
      method: 'POST',
      path: '/auth/change-password',
      inputStructure: 'detailed',
      summary: "Change the current user's password",
    })
    // Two kinds of 400 told apart by `code`: the current password was wrong,
    // or the policy refused the new one, and by which rule.
    .errors({
      ...commonAuthErrors,
      'wrong-current-password': { status: 400 },
      ...passwordRejections,
    })
    .input(z.object({ body: changePasswordSchema }))
    // The refreshed identity, mustChangePassword cleared, so the client needs
    // no second fetch.
    .output(authUserSchema),
};
