/**
 * The customer exchange (FR-ADM-11): rows about the people who buy from the
 * shop, and their diff. It issues no credential (FR-ADM-13): a new account is
 * `invited` and mailed the platform's own link. It never deletes (FR-ADM-15):
 * the strongest row disables, and an account its owner closed is refused.
 */
import { oc } from '@orpc/contract';
import * as z from 'zod';
import { machineAuthErrors } from './machine-auth.contract';
import { customerTypeSchema } from '../accounts/users.contract';
import {
  companyNameSchema,
  companyRegistrationIdSchema,
  lowercaseEmailField,
} from '../../lib/config/contact-config';
import { ownershipErrors } from '../../platform/ownership-constants';
import { CUSTOMER_SYNC_FIELDS } from './customer-sync-constants';
import {
  SYNC_FAILURE_MESSAGE_MAX_LENGTH,
  SYNC_LABEL_MAX_LENGTH,
  SYNC_MAX_ROWS,
} from './sync-constants';
import {
  machineRunErrors,
  machineSyncRunSchema,
  syncFailureReportSchema,
  syncRunSchema,
  syncSummarySchema,
} from './sync-run.contract';
import { TIER_KEY_MAX_LENGTH } from '../catalog/tiers';

/**
 * Two values, not the five statuses: those track how far the person got, and
 * the other system decides only whether they are a customer. `enabled` creates,
 * approves or reactivates by the account's state; `disabled` also declines a
 * registration.
 */
const customerAccessSchema = z.enum(['enabled', 'disabled']);

/**
 * One customer, keyed by `sourceId` (FR-ADM-14), never by address or company
 * id, which change and can be shared. Absent is left alone; null is a value
 * (the base list, not a company). Name and phone seed a new account only: they
 * are the holder's own (FR-ADM-15).
 */
export const customerSyncRowSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(255),
    /** Required to create; writable after, as the holder cannot change it. */
    email: lowercaseEmailField(255).optional(),
    /** The platform's id, from the outward read (FR-ADM-18). Read only to
     * claim a keyless account (FR-ADM-17); a key always wins (FR-ADM-14). */
    accountId: z.uuid().optional(),
    access: customerAccessSchema.optional(),
    /** The key a catalog run's `price:<key>` names; null is the base list. */
    tierKey: z
      .string()
      .trim()
      .min(1)
      .max(TIER_KEY_MAX_LENGTH)
      .nullable()
      .optional(),
    /** Null: a customer buying as a person. */
    customerType: customerTypeSchema.nullable().optional(),
    companyName: companyNameSchema.nullable().optional(),
    companyRegistrationId: companyRegistrationIdSchema.nullable().optional(),
    /** Seeds a new account only; ignored on one that exists (FR-ADM-15). */
    firstName: z.string().trim().min(1).max(200).optional(),
    lastName: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(1).max(50).optional(),
    /** Re-send the set-a-password link: the panel's button while the area is
     * owned. The one instruction here, so every run carrying it mails again. */
    sendPasswordLink: z.boolean().default(false),
  })
  .strict();
export type CustomerSyncRow = z.infer<typeof customerSyncRowSchema>;

/** What a run may write besides access. */
export const customerSyncFieldSchema = z.enum(CUSTOMER_SYNC_FIELDS);

/** No sweep, unlike the catalog: access changes only by a row naming the
 * customer, never by omission. */
export const customerSyncOptionsSchema = z
  .object({
    /** Fields this run writes. Empty writes nothing but access. */
    fields: z.array(customerSyncFieldSchema).default([...CUSTOMER_SYNC_FIELDS]),
    /** For an unknown key asking for access; off, it is a row error. */
    createMissing: z.boolean().default(true),
    /** Update accounts whose `sourceId` is known. */
    updateExisting: z.boolean().default(true),
    /** An unknown key adopts the keyless account holding its address, once
     * (FR-ADM-17); from then on the key is its identity (FR-ADM-14). Gated by
     * `maxClaims`, as a typo upstream would take over a real account. */
    claimByEmail: z.boolean().default(false),
    /** The same adoption by `accountId` (FR-ADM-17), with its own ceiling
     * `maxIdClaims`. Not on the upload: a spreadsheet has no internal ids. */
    claimById: z.boolean().default(false),
  })
  .strict();
export type CustomerSyncOptions = z.infer<typeof customerSyncOptionsSchema>;

const customerFieldChangeSchema = z
  .object({
    /** `email`, `tier`, `customerType`, `companyName`, `companyId`. */
    field: z.string(),
    from: z.string().nullable(),
    to: z.string().nullable(),
  })
  .strict();

/** What happens to one person, not the status it lands on. A claim outranks
 * the other kinds; `changes` still lists what else the row rewrote. */
const customerAccountChangeSchema = z
  .object({
    kind: z.enum([
      'invite',
      'update',
      'disable',
      'enable',
      'claim',
      /** By id: other evidence than `claim`, so a reader can tell them apart. */
      'claim-id',
    ]),
    sourceId: z.string(),
    email: z.string().nullable(),
    /** Null for an account this run creates. */
    id: z.uuid().nullable(),
    /** Empty for invite, disable and enable. */
    changes: z.array(customerFieldChangeSchema),
    /** A set-a-password link goes out: an invite, or the row asked. */
    mailed: z.boolean(),
  })
  .strict();
export type CustomerAccountChange = z.infer<typeof customerAccountChangeSchema>;

/** Why a row was skipped; `params` quote the sender's data back. */
const CUSTOMER_SYNC_ROW_ERROR_CODES = [
  'missing-source-id',
  /** The same sourceId twice in one run. */
  'duplicate-source-id',
  /** `{email}`: two rows of this run name one address. */
  'duplicate-email',
  /** `{email}`: a keyed account already has it. */
  'email-taken',
  /** `{email}`: a keyless account has it, almost certainly this person; the
   * wording points at the claim option (FR-ADM-17). */
  'account-unclaimed',
  /** `{accountId}`: names no account. No fall back to the address, or a
   * wrong mapping becomes a wrong adoption. */
  'account-unknown',
  /** `{accountId}`: already keyed; a second key is refused (FR-ADM-14). */
  'account-already-keyed',
  /** `{accountId}` and `{email}`: adoptable, but claiming by id is off. Its
   * own code, as the remedy is another switch. */
  'account-unclaimed-by-id',
  /** `{key}` and `{known}` */
  'unknown-tier',
  /** An unknown `sourceId` asking for access, with no address to mail. */
  'cannot-create-account',
  /** Closed by its owner (FR-AUTH-06); it keeps its key for this refusal. */
  'account-withdrawn',
  /** The key or the address names a staff account. */
  'staff-account',
  /** A set-a-password link was asked for an account that cannot sign in. */
  'cannot-send-link',
  /** A company needs both a name and a registration id. */
  'company-details-incomplete',
  /** `{type}`: not sold to (FR-AUTH-13). */
  'customer-type-not-accepted',
  /** `{column}` and `{value}`: a cell its column cannot hold. Uploads only
   * (FR-ADM-12): a submission's schema refuses the whole request instead. */
  'invalid-value',
] as const;
export type CustomerSyncRowErrorCode =
  (typeof CUSTOMER_SYNC_ROW_ERROR_CODES)[number];

/** A skipped row; the rest of the run still applies. */
export const customerSyncRowErrorSchema = z
  .object({
    /** 1-based position in the submitted rows. */
    row: z.number().int().positive(),
    sourceId: z.string().nullable(),
    code: z.enum(CUSTOMER_SYNC_ROW_ERROR_CODES),
    params: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type CustomerSyncRowError = z.infer<typeof customerSyncRowErrorSchema>;

/** The summary is the shared one: here invited, edited, disabled. */
export const customerSyncPlanSchema = z
  .object({
    summary: syncSummarySchema,
    accounts: z.array(customerAccountChangeSchema),
    rowErrors: z.array(customerSyncRowErrorSchema),
    /** True when the list above was capped at SYNC_PREVIEW_MAX_ITEMS. */
    truncated: z.boolean(),
  })
  .strict();
export type CustomerSyncPlan = z.infer<typeof customerSyncPlanSchema>;

/** For a template narrowing the plan union: `area` cannot narrow the value,
 * and the shapes are disjoint. */
export function isCustomerSyncPlan(plan: unknown): plan is CustomerSyncPlan {
  return typeof plan === 'object' && plan !== null && 'accounts' in plan;
}

/** The catalog submission's envelope around customer rows. */
const customerSyncSubmissionSchema = z
  .object({
    rows: z.array(customerSyncRowSchema).max(SYNC_MAX_ROWS),
    options: customerSyncOptionsSchema.optional(),
    label: z.string().trim().min(1).max(SYNC_LABEL_MAX_LENGTH).optional(),
    requestReview: z.boolean().default(false),
    notice: z
      .string()
      .trim()
      .min(1)
      .max(SYNC_FAILURE_MESSAGE_MAX_LENGTH)
      .optional(),
  })
  .strict();
export type CustomerSyncSubmission = z.infer<
  typeof customerSyncSubmissionSchema
>;

const customerSyncSubmitResponseSchema = z
  .object({ run: syncRunSchema, plan: customerSyncPlanSchema })
  .strict();
export type CustomerSyncSubmitResponse = z.infer<
  typeof customerSyncSubmitResponseSchema
>;

/** An upload's preview (FR-ADM-12): one engine, so one shape. */
export type CustomerSyncPreviewResponse = CustomerSyncSubmitResponse;

/** Token only, with its own scope; refused while the shop keeps the accounts
 * itself. */
const machine = oc.errors({
  ...machineAuthErrors,
  'customers-not-externally-owned':
    ownershipErrors['customers-not-externally-owned'],
});

/** Not gated on ownership, as on the catalog's. */
const machineRead = oc.errors(machineAuthErrors);

/** Its own paths, not an `area` field on the catalog's: the guard checks a
 * route's one scope before the body is read. No commit route, as on the
 * catalog's. */
export const machineCustomerSyncContract = {
  submitRun: machine
    .route({
      method: 'POST',
      path: '/machine/sync/customers/runs',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Submit customer accounts (machine)',
    })
    .input(z.object({ body: customerSyncSubmissionSchema }))
    .output(customerSyncSubmitResponseSchema),

  /** What became of a customer run (FR-ADM-09); a catalog run's id is not
   * found here. */
  getRun: machineRead
    .route({
      method: 'GET',
      path: '/machine/sync/customers/runs/{id}',
      inputStructure: 'detailed',
      summary: 'Read back one customer run (machine)',
    })
    .errors(machineRunErrors)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ run: machineSyncRunSchema }).strict()),

  /** A run that never happened, so a broken feed is not silence. */
  reportFailure: machine
    .route({
      method: 'POST',
      path: '/machine/sync/customers/failures',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Record a customer run that failed before it began (machine)',
    })
    .input(z.object({ body: syncFailureReportSchema }))
    .output(z.object({ run: syncRunSchema }).strict()),
};
