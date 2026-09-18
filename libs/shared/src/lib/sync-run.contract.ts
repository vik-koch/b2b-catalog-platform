import * as z from 'zod';
import {
  SYNC_AREAS,
  SYNC_FAILURE_MESSAGE_MAX_LENGTH,
  SYNC_LABEL_MAX_LENGTH,
} from './sync-constants';

/**
 * A run, and everything that is true of one whatever it carries (ADR 0060).
 *
 * Its own file because it is the shared half of two contracts: a catalog run
 * and a customer run differ in their rows and in who may read them, and agree
 * on absolutely everything else — the lifecycle, why a run was staged, who or
 * what ran it, the counts it is summarised by. Splitting it also keeps the two
 * area contracts from importing each other, which they would have to if this
 * lived in either of them.
 */

/**
 * Where a run ended up.
 *
 * `previewed` is staged and still applicable; `superseded` and `discarded` are
 * both staged runs that never will be, kept apart because they are different
 * sentences — the newer run replaced this one, or a person said no to it. Both
 * stay in the log: a preview nobody applied is part of the record.
 */
export const syncRunStatusSchema = z.enum([
  'previewed',
  'applied',
  'failed',
  /**
   * The source and the catalog already agree. Terminal from the moment it is
   * computed: there is nothing to apply, so there is no decision to put in
   * front of anybody — and a queue holding runs with nothing in them is a
   * queue that stops being read. A run that skipped rows is never this,
   * however empty its diff: "nothing happened" and "the file could not be read
   * and so nothing happened" are opposite pieces of news.
   */
  'no-change',
  'superseded',
  'discarded',
]);
export type SyncRunStatus = z.infer<typeof syncRunStatusSchema>;

/** How the run entered the system: an admin's upload, or a machine token. */
export const syncRunSourceSchema = z.enum(['upload', 'api']);

/**
 * Which area of the platform's data the run carries. Two runs of different
 * areas share everything in this file except the rows they hold and who may
 * read them, which is why the area is a field and not a second contract.
 */
export const syncAreaSchema = z.enum(SYNC_AREAS);

/**
 * The counts every run is summarised by, whatever it carried.
 *
 * One shape across the areas, which is what lets a single log list them side by
 * side: `create`, `update`, `softDelete` and `errors` are read without knowing
 * what a row was. They are products created, edited and hidden for a catalog
 * run, and accounts invited, edited and switched off for a customer one — what
 * each means in words is the admin text's business, keyed by area. The fields
 * only one area fills default to zero.
 */
export const syncSummarySchema = z
  .object({
    rows: z.number().int().nonnegative(),
    create: z.number().int().nonnegative(),
    update: z.number().int().nonnegative(),
    softDelete: z.number().int().nonnegative(),
    restore: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    /** Defaulted, like the three below it: an area that has no categories
     * does not carry the count, and neither did a summary stored before the
     * field existed. */
    categoriesCreated: z.number().int().nonnegative().default(0),
    /** Defaulted, so summaries stored before renaming existed still parse. */
    categoriesRenamed: z.number().int().nonnegative().default(0),
    /**
     * Categories this run leaves with nothing in them — because it moved their
     * products elsewhere, or swept them. Counted beside the creates because the
     * two together are what a source-side regrouping looks like. Defaulted,
     * like the rename count above.
     */
    categoriesEmptied: z.number().int().nonnegative().default(0),
    /** Live products absent from the file but kept because they are `manual:`. */
    keptManual: z.number().int().nonnegative().default(0),
    /**
     * Mails this run sent to the people it is about — the set-a-password links
     * a customer run hands to accounts it invited, and to anyone whose row
     * asked for one again (FR-ADM-13).
     *
     * A count of an effect rather than of a row, and the only one here that is
     * not a row: a run that changed no account but re-sent one link did
     * something, and calling it `no-change` would file a mail somebody
     * received under "nothing happened".
     */
    mailed: z.number().int().nonnegative().default(0),
    /**
     * Accounts this run adopted: existing rows that carried no source key and
     * were matched by address instead, once (FR-ADM-17).
     *
     * Counted apart from `update` although a claim is an edit, because it is
     * the one edit that changes *which account* a key means from then on. A
     * reader deciding whether to apply a staged run is owed that figure by
     * itself. Defaulted, like `mailed`: an area that cannot claim does not
     * carry it, and neither did a summary stored before this existed.
     */
    claimed: z.number().int().nonnegative().default(0),
    errors: z.number().int().nonnegative(),
    /**
     * Which fields this run rewrote, as they are named in a change:
     * `name`, `category`, `stock`, `price:<listKey>`. The counts say how much a
     * run did; this says *what* it does, which for a feed that runs every
     * twenty minutes is the more useful of the two.
     *
     * Only rewrites: a product this run creates writes everything it carries by
     * definition, and the create count already says so. Defaulted, so summaries
     * stored before this existed still parse.
     */
    fields: z.array(z.string()).default([]),
  })
  .strict();
export type SyncSummary = z.infer<typeof syncSummarySchema>;

/**
 * Why a run was left for a person instead of applying itself (ADR 0055).
 * `policy` — its effect was outside what the deployment lets a run do
 * unattended. `requested` — the caller asked to be doubted, which it does when
 * it cannot fully vouch for what it parsed. The screen has to say which, or an
 * ordinary large import and one whose parsing is suspect look the same.
 */
export const syncStagedReasonSchema = z.enum(['policy', 'requested']);
export type SyncStagedReason = z.infer<typeof syncStagedReasonSchema>;

export const syncRunSchema = z
  .object({
    id: z.uuid(),
    status: syncRunStatusSchema,
    /** What the run is about. On the run's own page this is what decides how
     * the body reads — a run id is unique across areas, so one screen serves
     * them all and a link already in somebody's inbox keeps working. */
    area: syncAreaSchema,
    source: syncRunSourceSchema,
    filename: z.string().nullable(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    /** Who ran it; null if that account has since been deleted, and null for
     * a machine run, which has no person behind it at all. */
    actorEmail: z.string().nullable(),
    /** The token that submitted it, by name. Null for an upload. Denormalized
     * like `actorEmail`, so the trail still names the credential after it is
     * revoked and renamed out of use. */
    tokenName: z.string().nullable(),
    /** Set only while a run is staged, or was staged and then ended without
     * being applied. Null on anything that applied itself. */
    stagedReason: syncStagedReasonSchema.nullable(),
    /**
     * The intent the run was submitted with, in whatever shape its own area
     * states one — a catalog run's field list and delete gate, a customer
     * run's much shorter set. Left unmodelled here on purpose: it is the one
     * part of a run that is not shared, nothing on the screens reads it, and
     * the area's own schema is what parses it where it is acted on.
     *
     * Null on a run that failed before it had any: an automated client's
     * report of its own breakage is a run that never got as far as intent.
     */
    options: z.record(z.string(), z.unknown()).nullable(),
    summary: syncSummarySchema.nullable(),
    error: z.string().nullable(),
    /**
     * Something the sending system wanted said about a run that otherwise went
     * through — a source file it had to skip part of, an export older than it
     * expected. Kept verbatim like `error`, and like `error` never interpreted
     * here; unlike it, the run still counts as having worked.
     */
    notice: z.string().nullable(),
  })
  .strict();
export type SyncRun = z.infer<typeof syncRunSchema>;

/**
 * A run as the automated source that produced it reads it back (FR-ADM-09).
 *
 * Everything the admin panel shows, minus `actorEmail`. What an automated
 * client is owed is what became of its run — applied, still waiting, replaced
 * by its own next submission — and not the address of the person who decided
 * it. That field is the one piece of personal data on an otherwise operational
 * record, it would travel outward on every poll, and nothing over there can
 * act on it.
 */
export const machineSyncRunSchema = syncRunSchema.omit({ actorEmail: true });
export type MachineSyncRun = z.infer<typeof machineSyncRunSchema>;

/**
 * Reading a run back has exactly one refusal, and it is the one that says
 * nothing rather than the one that explains. A run belonging to another area
 * answers this too: a `catalog-sync` credential learns that customer run 7 is
 * not its own by being told it does not exist, which is all it is owed.
 */
export const machineRunErrors = {
  'run-not-found': { status: 404 },
} as const;

/**
 * A breakage the caller wants recorded (NFR-OPS-07). It is not a refusal the
 * platform issued, so it carries no code: it is the automated client's own
 * account of what went wrong, kept verbatim for a person to read, the way a
 * failed run's `error` already is.
 */
export const syncFailureReportSchema = z
  .object({
    message: z.string().trim().min(1).max(SYNC_FAILURE_MESSAGE_MAX_LENGTH),
    label: z.string().trim().min(1).max(SYNC_LABEL_MAX_LENGTH).optional(),
  })
  .strict();
export type SyncFailureReport = z.infer<typeof syncFailureReportSchema>;
