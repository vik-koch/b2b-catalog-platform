import { oc } from '@orpc/contract';
import * as z from 'zod';
import { machineAuthErrors } from './api-tokens.contract';
import { customerTypeSchema } from './auth.contract';
import { CUSTOMER_READ_MAX_LIMIT } from './customer-sync-constants';

/**
 * The outbound read of customer accounts (FR-ADM-18, NFR-LEGAL-07): what a
 * connected system may learn about the people who buy from the shop.
 *
 * Until this existed the machine surface was write-only, and one whole half of
 * the arrangement could not happen. A person registers on the storefront; the
 * source system is supposed to create a counterparty for them and hand back
 * its own key — and it had no way to find out the account existed at all. The
 * exchange matches by that key (FR-ADM-14), so an account that never got one
 * is an account nothing outside can ever touch, including the registration
 * that is sitting there waiting for a decision only the other system can make.
 * FR-ADM-15 and NFR-LEGAL-07 already *said* account details travel outward.
 * This is the route that makes it true.
 *
 * **Its own capability** (`customer-read`), not a second route on
 * `customer-sync`. Reading the whole customer book and writing to people's
 * accounts are different powers over different risks, and a deployment
 * genuinely wants them apart: a system being prepared for a go-live reads for
 * weeks before it is ever handed the pen, and a feed that only pushes tiers has
 * no business pulling addresses. The guard asks each route for the one
 * capability it needs, so keeping them apart costs one enum value.
 *
 * **Not gated on ownership**, unlike every write in this area. A read carries
 * no instruction, and the case it exists for is precisely the one where nobody
 * has handed the area over yet: the other system has to see what is here before
 * it can claim any of it. What gates it is the token an admin issued, which is
 * the "configured rather than assumed" NFR-LEGAL-07 asks for.
 */

// --- What an account looks like from outside -----------------------------

/**
 * The account's state, in the words the outside is owed rather than the five
 * `users.status` holds.
 *
 * Four of them are the platform's own. The fifth is the one that is renamed:
 * an `anonymized` row is reported as **withdrawn**, because that is what
 * happened — the person closed their account (FR-AUTH-06) — and because
 * "anonymized" would be a claim about the receiving system's copy that this
 * platform is in no position to make (NFR-LEGAL-08).
 */
export const customerAccountStateSchema = z.enum([
  /** Registered here, waiting for somebody to decide. */
  'pending',
  /** May sign in, has never chosen a password. */
  'invited',
  'active',
  'disabled',
  /** Closed by the person themselves. Nothing but the keys is left. */
  'withdrawn',
]);
export type CustomerAccountState = z.infer<typeof customerAccountStateSchema>;

/**
 * One account as the outside sees it.
 *
 * Staff never appear here: a staff account is not a customer under any setting
 * (FR-ADM-10), and the exchange has no business knowing who administers the
 * shop.
 *
 * A **withdrawn** row carries its two keys, its state and its dates, and
 * nothing else — every personal field is null. It is deliberately still
 * listed rather than dropped: a customer that simply stopped appearing would
 * read as an export that had been filtered, and the whole point of reporting
 * the withdrawal is that the other system learns it happened (NFR-LEGAL-07).
 */
export const customerAccountRecordSchema = z
  .object({
    /**
     * The platform's own id. Stable across everything a person can change
     * about themselves, and the only handle an account **without** a source
     * key has — which is exactly the account this route exists to reveal.
     */
    id: z.uuid(),
    /**
     * The source system's key, where it has one (FR-ADM-14). Null means the
     * account was registered here and never claimed: nothing outside can
     * address it yet, and giving it a key — by claiming it on a run
     * (FR-ADM-17) or by an admin typing it in — is what lets the exchange
     * reach it.
     */
    sourceId: z.string().nullable(),
    state: customerAccountStateSchema,
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    customerType: customerTypeSchema.nullable(),
    companyName: z.string().nullable(),
    companyRegistrationId: z.string().nullable(),
    /** The price list this customer is charged, by the same `key` the exchange
     * writes and a catalog run's `price:<key>` column names. Null is the base
     * list. */
    tierKey: z.string().nullable(),
    createdAt: z.iso.datetime(),
    /** What `since` and the ordering are measured on. */
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type CustomerAccountRecord = z.infer<typeof customerAccountRecordSchema>;

// --- Paging --------------------------------------------------------------

/**
 * A page of accounts, oldest change first.
 *
 * Ordered by `updatedAt` rather than by creation, and paged by a cursor rather
 * than an offset, so the one call a scheduled puller actually wants is cheap:
 * "everything that has moved since the last time I asked". An offset over a
 * table being written to skips rows; a cursor over the same ordering as the
 * filter does not.
 */
export const listCustomerAccountsQuerySchema = z
  .object({
    /** Accounts changed at or after this moment. Omitted reads from the
     * beginning, which is what a first run wants. */
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

export const customerAccountsPageSchema = z
  .object({
    accounts: z.array(customerAccountRecordSchema),
    /**
     * Where to carry on, or null at the end of the list.
     *
     * Opaque on purpose: it encodes the ordering, and a client that took it
     * apart would break the day the ordering gained a tiebreak. The honest
     * resumption point across runs is the last record's own `updatedAt`, fed
     * back as `since`.
     */
    nextCursor: z.string().nullable(),
  })
  .strict();
export type CustomerAccountsPage = z.infer<typeof customerAccountsPageSchema>;

// --- The route -----------------------------------------------------------

const machine = oc.errors({
  ...machineAuthErrors,
  /** A cursor this route did not issue, or one from an incompatible ordering.
   * Its own refusal rather than a silent restart from the top: a puller that
   * quietly began again would re-read the whole book and never say why. */
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
