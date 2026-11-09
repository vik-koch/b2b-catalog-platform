/**
 * The outbound read of customer accounts (FR-ADM-18, NFR-LEGAL-07), so the
 * other system can find accounts registered here and key them. Its own scope,
 * `customer-read`: reading the book and writing accounts are separate powers.
 * Not gated on ownership: it is needed before the hand-over.
 */
import { oc } from '@orpc/contract';
import * as z from 'zod';

import { customerTypeSchema } from '../../core/accounts/users.contract';
import { machineAuthErrors } from '../../core/exchange/machine-auth.contract';

/** One page, and the default limit. */
const CUSTOMER_READ_MAX_LIMIT = 200;

/** `anonymized` reads as `withdrawn`: the person closed it (FR-AUTH-06), and
 * "anonymized" would claim something about the receiver's copy (NFR-LEGAL-08). */
const customerAccountStateSchema = z.enum([
  'pending',
  /** May sign in, has never chosen a password. */
  'invited',
  'active',
  'disabled',
  'withdrawn',
]);
export type CustomerAccountState = z.infer<typeof customerAccountStateSchema>;

/** Never staff. A withdrawn row keeps its keys, state and dates, all else
 * null, and is still listed so the other system learns of it (NFR-LEGAL-07). */
const customerAccountRecordSchema = z
  .object({
    /** The only handle a keyless account has. */
    id: z.uuid(),
    /** Null until claimed (FR-ADM-17) or typed in by an admin (FR-ADM-14). */
    sourceId: z.string().nullable(),
    state: customerAccountStateSchema,
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    customerType: customerTypeSchema.nullable(),
    companyName: z.string().nullable(),
    companyRegistrationId: z.string().nullable(),
    /** The key the exchange writes; null is the base list. */
    tierKey: z.string().nullable(),
    createdAt: z.iso.datetime(),
    /** What `since` and the ordering are measured on. */
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type CustomerAccountRecord = z.infer<typeof customerAccountRecordSchema>;

/** Oldest change first, by cursor: an offset over a table being written
 * skips rows. */
const listCustomerAccountsQuerySchema = z
  .object({
    /** Changed at or after; omitted reads from the beginning. */
    since: z.iso.datetime().optional(),
    /** `nextCursor` from the previous page, verbatim. */
    cursor: z.string().trim().min(1).max(200).optional(),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(CUSTOMER_READ_MAX_LIMIT)
      .default(CUSTOMER_READ_MAX_LIMIT),
  })
  .strict();
export type ListCustomerAccountsQuery = z.infer<
  typeof listCustomerAccountsQuerySchema
>;

const customerAccountsPageSchema = z
  .object({
    accounts: z.array(customerAccountRecordSchema),
    /** Opaque, null at the end. Across runs, resume from the last record's
     * `updatedAt` as `since`. */
    nextCursor: z.string().nullable(),
  })
  .strict();
export type CustomerAccountsPage = z.infer<typeof customerAccountsPageSchema>;

const machine = oc.errors({
  ...machineAuthErrors,
  /** Refused, not restarted from the top without a word. */
  'invalid-cursor': { status: 400 },
});

export const machineCustomerReadContract = {
  listAccounts: machine
    .route({
      method: 'GET',
      path: '/machine/customers/accounts',
      inputStructure: 'detailed',
      summary: 'Read customer accounts (machine)',
    })
    .input(z.object({ query: listCustomerAccountsQuerySchema }))
    .output(customerAccountsPageSchema),
};
