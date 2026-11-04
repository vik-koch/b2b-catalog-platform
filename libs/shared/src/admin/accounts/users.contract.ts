import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  COMMON_AUTH_ERROR_CODES,
  commonAuthErrors,
  phoneFormatErrors,
} from '../../platform/api-error';
import { userRoleSchema } from '../../platform/session.contract';
import {
  userStatusSchema,
  staffUserSchema,
  updateUserSchema,
  createUserSchema,
  deleteAccountOnRequestSchema,
  userKindSchema,
} from '../../core/accounts/users.contract';
import { ownershipErrors } from '../../platform/ownership';
import { consentRecordListSchema } from './consents.contract';

/** Approval (FR-AUTH-03). The tier is required: there is no default to fall
 * back to, and `null` is the base price list chosen on purpose. */
export const approveUserSchema = z
  .object({ tierId: z.uuid().nullable() })
  .strict();

/** Switching an account off or back on (FR-AUTH-04): a transition, not a
 * field, as it ends every session. Back on lands on `active` or `invited`,
 * whichever its password allows; the response says which. */
export const setUserActiveSchema = z.object({ active: z.boolean() }).strict();

/** Filters for the account list (FR-ADM-05). */
export const listUsersQuerySchema = z.object({
  kind: userKindSchema.optional(),
  status: userStatusSchema.optional(),
  /** Narrows within `staff` (admin vs manager); customers are all one role. */
  role: userRoleSchema.optional(),
  /** `null` is not expressible in a query string; `default` means the base list. */
  tierId: z.union([z.uuid(), z.literal('default')]).optional(),
  /** A `companyIdInput.formats` key, or `COMPANY_ID_NONE`. A plain string, as
   * the keys are config: an unknown one matches nothing. */
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
  /** Unknown, or staff seen by a manager: the same answer. */
  'account-not-found',
  'account-not-pending',
  'account-closed',
  'email-taken',
  /** Another account already carries that source key (FR-ADM-14). */
  'source-id-taken',
  /** Only an `active` or `invited` account can be switched off. */
  'account-not-approved',
  'account-not-disabled',
  /** Nothing to send a link to: the account cannot sign in at all. */
  'account-cannot-sign-in',
  'self-deactivate',
  'self-demote',
  'last-admin',
  /** Approved accounts are anonymized, never deleted. */
  'account-not-purgeable',
  /** Deleting your own account is FR-AUTH-06, with your password. */
  'self-delete',
  /** A registration nobody has decided on is declined, not deleted. */
  'account-pending',
  /** The deployment lets no account of this role skip the code (FR-AUTH-12). */
  'not-exemptable',
  /** A kind of customer the shop does not sell to (FR-AUTH-13). */
  'customer-type-not-accepted',
] as const;
export type UserErrorCode = (typeof USER_ERROR_CODES)[number];

/**
 * The status each refusal travels with. `account-not-found` is the only 404
 * and `customer-type-not-accepted` the only 400 — the request names a kind of
 * customer the shop does not take; every other one is a conflict — the
 * account exists, and what was asked of it is what cannot be done.
 */
const notFound = { 'account-not-found': { status: 404 } } as const;
const typeRefused = {
  'customer-type-not-accepted': { status: 400 },
} as const;

/**
 * Every write to a *customer* account carries this, and none of the reads do:
 * while an external system owns customer accounts the platform's own side is
 * closed as a whole (FR-ADM-10), while the screens that show them stay open.
 * Staff administration is never refused by it — an admin has to be able to
 * appoint another admin whatever the exchange holds.
 */
const owned = {
  'customers-externally-owned': ownershipErrors['customers-externally-owned'],
} as const;
const conflicts = {
  'account-not-pending': { status: 409 },
  'account-closed': { status: 409 },
  'email-taken': { status: 409 },
  'source-id-taken': { status: 409 },
  'account-not-approved': { status: 409 },
  'account-not-disabled': { status: 409 },
  'account-cannot-sign-in': { status: 409 },
  'self-deactivate': { status: 409 },
  'self-demote': { status: 409 },
  'last-admin': { status: 409 },
  'account-not-purgeable': { status: 409 },
  'self-delete': { status: 409 },
  'account-pending': { status: 409 },
  'not-exemptable': { status: 409 },
} as const;

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
  /** The source key is an admin's, for the reason the ownership switch is. */
  'source-id-change-admin-only',
] as const;

/** Staff-only, and the two manager limits reach a screen rather than a redirect. */
const staff = oc.errors({
  ...commonAuthErrors,
  'role-change-admin-only': { status: 403 },
  'staff-create-admin-only': { status: 403 },
  'source-id-change-admin-only': { status: 403 },
});

export const usersContract = {
  listUsers: staff
    .route({
      method: 'GET',
      path: '/admin/users',
      inputStructure: 'detailed',
      summary: 'List accounts, filtered (admin, manager)',
    })
    .input(z.object({ query: listUsersQuerySchema }))
    .output(z.object({ users: z.array(staffUserSchema) }).strict()),

  approveUser: staff
    .route({
      method: 'POST',
      path: '/admin/users/{id}/approve',
      inputStructure: 'detailed',
      summary: 'Approve a registration, assign a tier, send the invitation',
    })
    .errors({
      ...notFound,
      // Only a pending registration can be approved.
      'account-not-pending': conflicts['account-not-pending'],
      ...owned,
    })
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        body: approveUserSchema,
      }),
    )
    .output(staffUserSchema),

  createUser: staff
    .route({
      method: 'POST',
      path: '/admin/users',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Create an account and invite it (admin, manager)',
    })
    // Email already has an account.
    .errors({
      'email-taken': conflicts['email-taken'],
      'source-id-taken': conflicts['source-id-taken'],
      ...typeRefused,
      ...phoneFormatErrors,
      ...owned,
    })
    .input(z.object({ body: createUserSchema }))
    .output(staffUserSchema),

  getUser: staff
    .route({
      method: 'GET',
      path: '/admin/users/{id}',
      inputStructure: 'detailed',
      // The editor is a route, so a reload of it has no list to read from.
      summary: 'One account (admin, manager)',
    })
    .errors(notFound)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(staffUserSchema),

  listUserConsents: staff
    .route({
      method: 'GET',
      path: '/admin/users/{id}/consents',
      inputStructure: 'detailed',
      summary: "An account's consent records (admin)",
    })
    .errors(notFound)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(consentRecordListSchema),

  updateUser: staff
    .route({
      method: 'PATCH',
      path: '/admin/users/{id}',
      inputStructure: 'detailed',
      summary: 'Edit an account; role is admin only (admin, manager)',
    })
    .errors({
      ...notFound,
      // Would leave the deployment with no admin, or demote yourself.
      'self-demote': conflicts['self-demote'],
      'last-admin': conflicts['last-admin'],
      'email-taken': conflicts['email-taken'],
      'source-id-taken': conflicts['source-id-taken'],
      'account-closed': conflicts['account-closed'],
      ...typeRefused,
      ...phoneFormatErrors,
      ...owned,
    })
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        body: updateUserSchema,
      }),
    )
    .output(staffUserSchema),

  setUserActive: staff
    .route({
      method: 'PATCH',
      path: '/admin/users/{id}/active',
      inputStructure: 'detailed',
      summary: 'Deactivate or reactivate an account (admin, manager)',
    })
    .errors({
      ...notFound,
      // Your own account, the last admin, a registration nobody has decided
      // on yet, or an anonymized one — which has nothing left to switch on.
      'account-not-approved': conflicts['account-not-approved'],
      'account-not-disabled': conflicts['account-not-disabled'],
      'self-deactivate': conflicts['self-deactivate'],
      'last-admin': conflicts['last-admin'],
      ...owned,
    })
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        body: setUserActiveSchema,
      }),
    )
    .output(staffUserSchema),

  sendPasswordLink: staff
    .route({
      method: 'POST',
      path: '/admin/users/{id}/password-link',
      inputStructure: 'detailed',
      // The way back in for somebody who rings the shop. The account's status
      // decides whether the invitation or the reset goes.
      summary: 'Send the account a way back in (admin, manager)',
    })
    .errors({
      ...notFound,
      // Nothing to send to: a pending, disabled or anonymized account.
      'account-cannot-sign-in': conflicts['account-cannot-sign-in'],
      ...owned,
    })
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ message: z.string() })),

  deleteUser: staff
    .route({
      method: 'DELETE',
      path: '/admin/users/{id}',
      inputStructure: 'detailed',
      summary: 'Decline and purge a pending registration (admin, manager)',
    })
    .errors({
      ...notFound,
      // Only an unapproved registration can be deleted outright; an account
      // that has ever been usable is anonymized instead, never removed.
      'account-not-purgeable': conflicts['account-not-purgeable'],
      ...owned,
    })
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ message: z.string() })),

  deleteAccountOnRequest: staff
    .route({
      method: 'POST',
      path: '/admin/users/{id}/deletion',
      inputStructure: 'detailed',
      // The holder's own deletion (FR-AUTH-06), done for them when the request
      // reaches the shop another way. Never refused by ownership: the person's
      // right outranks the switch.
      summary: "Delete an account on the person's request (admin)",
    })
    .errors({
      ...notFound,
      'account-closed': conflicts['account-closed'],
      'account-pending': conflicts['account-pending'],
      'self-delete': conflicts['self-delete'],
      'last-admin': conflicts['last-admin'],
    })
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        body: deleteAccountOnRequestSchema,
      }),
    )
    .output(staffUserSchema),

  setSignInStepExemption: staff
    .route({
      method: 'PUT',
      path: '/admin/users/{id}/sign-in-step-exemption',
      inputStructure: 'detailed',
      // Never refused by ownership: it is about how a person signs in, which
      // no external system holds.
      summary:
        'Exempt an account from the code after the password, or undo it (admin)',
    })
    .errors({
      ...notFound,
      'account-closed': conflicts['account-closed'],
      'not-exemptable': conflicts['not-exemptable'],
    })
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        body: z.object({ exempt: z.boolean() }).strict(),
      }),
    )
    .output(staffUserSchema),
};
