import { sql } from 'drizzle-orm';
import {
  CONSENT_PURPOSES,
  CONSENT_WITHDRAWAL_NOTE_MAX,
  CONSENT_WITHDRAWAL_REASONS,
} from '@b2b-catalog-platform/shared/core/site';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { oneOf } from '../../platform/db/sql-columns';
import { identities } from '../../platform/db/schema';

/**
 * Every save of a static page, one row each; the slug's highest version is the
 * page. Append-only: a consent or an accepted order points at a row, so a row
 * must keep saying what it said.
 */
export const pageVersions = pgTable(
  'page_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** One of the fixed set (`PAGE_SLUGS`). */
    slug: varchar('slug', { length: 64 }).notNull(),
    version: integer('version').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    /** Always sanitised: the admin endpoint and the seed both write through
     * `sanitizeRichText`. */
    bodyHtml: text('bodyHtml').notNull(),
    /** The box wording, on a consent page only. */
    consentLabel: text('consentLabel'),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Null for seeded content. With the email beside it, so the history
     * names the editor once the account is gone. */
    createdBy: uuid('createdBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
    createdByEmail: varchar('createdByEmail', { length: 255 }),
  },
  (t) => [
    uniqueIndex('page_versions_slug_version').on(t.slug, t.version),
    check('page_versions_version_positive', sql`${t.version} > 0`),
  ],
);

/**
 * A consent given to processing personal data (NFR-LEGAL-09), the shop's
 * evidence of it. It points at the exact page version the person read, whose
 * box wording is what they ticked.
 *
 * An account's, or for an inquiry, that of the address or number given: an
 * inquiry is mailed, never stored, so this row is all that remains of it. The
 * email is copied for an account too, as a record that names nobody once the
 * account is gone proves nothing.
 *
 * Never updated, which a database trigger enforces: a record is
 * inserted, and deleted when its retention ends.
 */
export const consents = pgTable(
  'consents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purpose: varchar('purpose', { length: 16 }).notNull(),
    pageVersionId: uuid('pageVersionId')
      .notNull()
      .references(() => pageVersions.id, { onDelete: 'restrict' }),
    /** No foreign key: the row never changes, and `set null` is a change. A
     * declined registration is deleted, and its consent outlives it. */
    userId: uuid('userId'),
    email: varchar('email', { length: 320 }),
    phone: varchar('phone', { length: 50 }),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('consents_purpose', oneOf('purpose', CONSENT_PURPOSES)),
    check(
      'consents_names_someone',
      sql`${t.email} is not null or ${t.phone} is not null`,
    ),
    index('consents_userId_idx').on(t.userId),
    index('consents_email_idx').on(t.email),
    index('consents_phone_idx').on(t.phone),
  ],
);

/**
 * When a consent ended (NFR-LEGAL-09), one row per record at most. Its own
 * table because the record never changes: the withdrawal is a second fact
 * about it, and a record's retention runs from here.
 *
 * Never updated either, which the same trigger enforces. It goes with its
 * record when that is deleted at the end of the retention period.
 */
export const consentWithdrawals = pgTable(
  'consent_withdrawals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    consentId: uuid('consentId')
      .notNull()
      .unique()
      .references(() => consents.id, { onDelete: 'cascade' }),
    reason: varchar('reason', { length: 32 }).notNull(),
    withdrawnAt: timestamp('withdrawnAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The admin who entered it, their address copied as on a page save. */
    enteredBy: uuid('enteredBy').references(() => identities.id),
    enteredByEmail: varchar('enteredByEmail', { length: 320 }),
    note: varchar('note', { length: CONSENT_WITHDRAWAL_NOTE_MAX }),
  },
  () => [
    check(
      'consent_withdrawals_reason',
      oneOf('reason', CONSENT_WITHDRAWAL_REASONS),
    ),
    // Entered by hand means entered by somebody.
    check(
      'consent_withdrawals_entered_by_someone',
      sql`"reason" <> 'entered' or "enteredBy" is not null`,
    ),
  ],
);
