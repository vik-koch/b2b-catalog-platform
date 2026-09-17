import { oc } from '@orpc/contract';
import * as z from 'zod';
import { machineAuthErrors } from './api-tokens.contract';
import { customerTypeSchema } from './auth.contract';
import {
  companyNameSchema,
  companyRegistrationIdSchema,
  lowercaseEmailField,
} from './contact-config';
import { ownershipErrors } from './ownership-constants';
import {
  CUSTOMER_SYNC_FIELDS,
  SYNC_FAILURE_MESSAGE_MAX_LENGTH,
  SYNC_LABEL_MAX_LENGTH,
  SYNC_MAX_ROWS,
} from './sync-constants';
import {
  syncFailureReportSchema,
  syncRunSchema,
  syncSummarySchema,
} from './sync-run.contract';
import { TIER_KEY_MAX_LENGTH } from './tier-constants';

/**
 * The customer exchange (FR-ADM-11): the rows a connected system sends about
 * the people who buy from the shop, and the diff they stand for.
 *
 * Its own file rather than a second half of `sync.contract.ts`, because that is
 * exactly what an area is (ADR 0060): everything *around* a run — its
 * lifecycle, its staged reason, its actor, its counts, who may read it — is
 * shared and stays there, and only the rows and what they mean live here.
 *
 * Two rules shape the row and are worth reading before the fields do.
 *
 * **It issues no credential** (FR-ADM-13). A run can ask for an account; the
 * platform creates it `invited` and mails the person the same set-a-password
 * link a manager's approval would. There is no password field here and there
 * never will be.
 *
 * **It does not delete** (FR-ADM-15). The strongest thing a row can say is
 * `access: 'disabled'`, which is the platform's own deactivation: sessions end,
 * outstanding links are retired, and everything that says who the person was
 * survives. Deleting an account stays the account holder's own act under
 * FR-AUTH-06, and a row naming an account that has been through it is refused
 * rather than obeyed — a deletion the next run could undo is not a deletion.
 */

// --- The row -------------------------------------------------------------

/**
 * What a run may ask about somebody's access.
 *
 * Deliberately two values rather than the five the `users.status` enum holds.
 * The statuses a platform account moves through — pending, invited, active,
 * disabled, anonymized — record how far *the person* has got with it, and most
 * of those transitions are theirs to make: only they can turn `invited` into
 * `active`, by choosing a password. What an owning system knows is the thing it
 * decides, which is whether this customer is one of theirs at all, and that is
 * this field.
 *
 * `enabled` on an account that does not exist asks for one; on a registration
 * waiting for a decision it is the approval; on a switched-off account it is
 * the reactivation. `disabled` covers refusing a registration and ending a
 * relationship alike — a declined registration is a disabled account, not a
 * fifth state that reads the same as the fourth.
 */
export const customerAccessSchema = z.enum(['enabled', 'disabled']);
export type CustomerAccess = z.infer<typeof customerAccessSchema>;

/**
 * One customer from the source, keyed by the private `sourceId` (FR-ADM-14) —
 * never by email address and never by registration id, both of which a person
 * can change and two people can share.
 *
 * Every field but the key is optional, and absent is *not* empty: an absent
 * field is left alone, never cleared. The exceptions are the two that are
 * nullable rather than merely optional (`tierKey` and the company pair), where
 * null is a value a manager could also choose — the base price list, and a
 * customer who is not a company.
 *
 * `firstName`, `lastName` and `phone` are read **only when this row creates an
 * account**, and are silently ignored on one that exists (FR-ADM-15). They are
 * the account holder's own to maintain, and a feed that ran every twenty
 * minutes would otherwise undo a customer's correction of their own name before
 * they had finished reading the confirmation. They are here at all because an
 * account being asked into being has no holder yet to have maintained anything.
 */
export const customerSyncRowSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(255),
    /**
     * Where the set-a-password link goes, and what the person signs in with.
     * Required to create an account and writable afterwards: the account holder
     * cannot change their own address here (the profile form writes name and
     * phone alone), so if the owning system could not, nobody could.
     */
    email: lowercaseEmailField(255).optional(),
    access: customerAccessSchema.optional(),
    /**
     * Which price list this customer is charged, by the same `key` a catalog
     * run's `price:<key>` column names. Null is the base list — a real choice
     * and a permanent state, not an omission.
     *
     * This field is why customers are exchanged before orders: iteration 12
     * handed over the prices, and until this arrived the key each customer is
     * charged was still assigned by hand.
     */
    tierKey: z
      .string()
      .trim()
      .min(1)
      .max(TIER_KEY_MAX_LENGTH)
      .nullable()
      .optional(),
    /** Null means neither is known — a customer buying as a person. */
    customerType: customerTypeSchema.nullable().optional(),
    companyName: companyNameSchema.nullable().optional(),
    companyRegistrationId: companyRegistrationIdSchema.nullable().optional(),
    /** Seeds a new account only; ignored on one that exists (FR-ADM-15). */
    firstName: z.string().trim().min(1).max(200).optional(),
    lastName: z.string().trim().min(1).max(200).optional(),
    phone: z.string().trim().min(1).max(50).optional(),
    /**
     * "Mail this person their set-a-password link again." The counterpart of
     * the button the admin panel closes while the area is owned: somebody rings
     * the shop, and the person who answers works in the other system.
     *
     * Not idempotent, and the only field here that is not: it is an instruction
     * rather than a state, so every run carrying it sends another mail. A feed
     * that sets it on every row of every export will mail the whole customer
     * list every twenty minutes, which is the sending system's bug to fix and
     * not something the platform can tell apart from a person pressing the
     * button twice.
     */
    sendPasswordLink: z.boolean().default(false),
  })
  .strict();
export type CustomerSyncRow = z.infer<typeof customerSyncRowSchema>;

// --- Per-run intent ------------------------------------------------------

/** What a run may write, beside the access it may grant or take away. */
export const customerSyncFieldSchema = z.enum(CUSTOMER_SYNC_FIELDS);
export type CustomerSyncField = z.infer<typeof customerSyncFieldSchema>;

/**
 * What a run is allowed to do.
 *
 * Shorter than the catalog's by one whole idea: there is **no sweep**. A
 * catalog export can claim to be the complete catalog and have what it omits
 * hidden, because a product it stops carrying is a product the shop stops
 * selling. A customer missing from an export is a customer that export did not
 * mention, and taking somebody's sign-in away by omission is not a mistake that
 * can be undone by the next file. Access is only ever changed by a row that
 * names the customer and says so.
 */
export const customerSyncOptionsSchema = z
  .object({
    /** Fields this run writes. Empty writes nothing but access. */
    fields: z.array(customerSyncFieldSchema).default([...CUSTOMER_SYNC_FIELDS]),
    /** Create accounts for rows whose `sourceId` is unknown and which ask for
     * access. Off means an unknown key is a row error instead. */
    createMissing: z.boolean().default(true),
    /** Update accounts whose `sourceId` is known. */
    updateExisting: z.boolean().default(true),
  })
  .strict();
export type CustomerSyncOptions = z.infer<typeof customerSyncOptionsSchema>;

// --- The diff ------------------------------------------------------------

/** One field's before → after, as plain text: there is nothing here a screen
 * has to format the way a price has to be formatted. */
export const customerFieldChangeSchema = z
  .object({
    /** `email`, `tier`, `customerType`, `companyName`, `companyId`. */
    field: z.string(),
    from: z.string().nullable(),
    to: z.string().nullable(),
  })
  .strict();
export type CustomerFieldChange = z.infer<typeof customerFieldChangeSchema>;

/**
 * What a run would do to one account.
 *
 * `invite` is a creation, `enable` and `disable` are the access moves, `update`
 * is everything else. They are kinds rather than a status, because what a
 * reader of a staged run needs to know is what is about to happen to this
 * person, not which enum value it lands on.
 */
export const customerAccountChangeSchema = z
  .object({
    kind: z.enum(['invite', 'update', 'disable', 'enable']),
    sourceId: z.string(),
    /** How the account is recognisable to staff: its address. Null on a row
     * that would create an account and carries none — which is a row error, and
     * appears in the plan as one. */
    email: z.string().nullable(),
    /** Null for an account this run creates; it does not exist yet. */
    id: z.uuid().nullable(),
    /** Empty for invite/disable/enable, which are self-describing. */
    changes: z.array(customerFieldChangeSchema),
    /** This run would mail this person their set-a-password link — because it
     * is inviting them, or because the row asked for it. */
    mailed: z.boolean(),
  })
  .strict();
export type CustomerAccountChange = z.infer<typeof customerAccountChangeSchema>;

/**
 * Why one row was skipped. Codes, not sentences, exactly as everywhere else;
 * `params` carries the values from the sending system's own data that the
 * deployment's wording quotes back.
 */
export const CUSTOMER_SYNC_ROW_ERROR_CODES = [
  'missing-source-id',
  /** The same sourceId twice in one run. */
  'duplicate-source-id',
  /** `{email}` — two rows of this run claim one address. */
  'duplicate-email',
  /** `{email}` — another account already has it. */
  'email-taken',
  /** `{key}` and `{known}` — no price list is keyed that. */
  'unknown-tier',
  /** An unknown `sourceId` asking for access, with no address to mail. */
  'cannot-create-account',
  /**
   * The account behind this key has been closed by the person themselves
   * (FR-AUTH-06). It keeps its key precisely so this refusal can happen rather
   * than a stranger being created and mailed (FR-ADM-15).
   */
  'account-withdrawn',
  /** The key or the address names a staff account, which is never a customer. */
  'staff-account',
  /** A set-a-password link was asked for an account that cannot sign in. */
  'cannot-send-link',
  /** A company needs both a name and a registration id, and this one has one. */
  'company-details-incomplete',
] as const;
export type CustomerSyncRowErrorCode =
  (typeof CUSTOMER_SYNC_ROW_ERROR_CODES)[number];

/** A row that could not be applied. The run still previews and commits; these
 * rows are skipped, so one bad row never fails a whole exchange. */
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

/**
 * What a customer run would do, or did.
 *
 * The **summary is the shared one** — a run's counts are counts whatever the
 * run carries, and the log that lists every area's runs side by side reads
 * `create`, `update`, `softDelete` and `errors` off it without knowing which
 * area it is looking at. Here they are accounts invited, accounts edited and
 * accounts switched off; the wording per area is the admin text's business, and
 * the fields the catalog alone fills default to zero.
 */
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

/**
 * Which kind of plan a run's page is holding. A run's `area` says it too, but a
 * template narrowing a union needs the answer from the value itself — and the
 * two shapes are disjoint, so the question is decidable without a tag stored
 * beside every plan ever written.
 */
export function isCustomerSyncPlan(plan: unknown): plan is CustomerSyncPlan {
  return typeof plan === 'object' && plan !== null && 'accounts' in plan;
}

// --- The headless surface ------------------------------------------------

/**
 * What an automated client submits. The same envelope a catalog submission
 * uses — label, notice, `requestReview` — around customer rows, because those
 * three are facts about a *run* and not about what it carries.
 */
export const customerSyncSubmissionSchema = z
  .object({
    rows: z.array(customerSyncRowSchema).max(SYNC_MAX_ROWS),
    options: customerSyncOptionsSchema.optional(),
    /** What to call this run in the log, where an upload has a filename. */
    label: z.string().trim().min(1).max(SYNC_LABEL_MAX_LENGTH).optional(),
    /** "Stage this even if it would otherwise apply." */
    requestReview: z.boolean().default(false),
    /** Something the sending system wants a person to read beside the run. */
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

export const customerSyncSubmitResponseSchema = z
  .object({ run: syncRunSchema, plan: customerSyncPlanSchema })
  .strict();
export type CustomerSyncSubmitResponse = z.infer<
  typeof customerSyncSubmitResponseSchema
>;

/**
 * Authenticated by the token alone, and by a scope of its own: a credential
 * that receives the catalog has no business writing to people's accounts, and
 * the guard asks each route for the one capability it needs.
 */
const machine = oc.errors({
  ...machineAuthErrors,
  // Nobody has handed customer accounts over, so the shop is working them by
  // hand and a second writer is refused. The mirror of the refusal the admin
  // panel meets while they *are* owned.
  'customers-not-externally-owned':
    ownershipErrors['customers-not-externally-owned'],
});

/**
 * The machine half of the customer exchange.
 *
 * Its own paths rather than an `area` field on the catalog's, which is the one
 * place this area parts company with ADR 0060. The reason is the scope: a
 * machine route names the single capability it needs and the guard checks it
 * before the body is ever read, so two areas on one path would mean either one
 * credential that can do both or a scope check moved into the handler, where a
 * new route can forget it. The catalog's own paths are untouched — a v1.10.0
 * adapter keeps working unchanged.
 *
 * No commit route here either, for the reason there is none there: an automated
 * client never presses apply. Its run either applied itself under the
 * deployment's policy, or a person applies it from the panel.
 */
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

  /** A run that never happened, recorded so a broken exchange looks like
   * something rather than like silence. */
  reportFailure: machine
    .route({
      method: 'POST',
      path: '/machine/sync/customers/failures',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Record a customer run that failed before it began (machine)',
    })
    // The same report shape the catalog's failures use: what broke is the
    // sending system's own sentence either way, and nothing in it is about
    // what the run would have carried.
    .input(z.object({ body: syncFailureReportSchema }))
    .output(z.object({ run: syncRunSchema }).strict()),
};
