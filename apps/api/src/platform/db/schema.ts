import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  OWNERSHIP_AREAS,
  SETTING_CHANGE_KINDS,
} from '@b2b-catalog-platform/shared/platform';

import {
  DESTRUCTION_CATEGORIES,
  DESTRUCTION_REASONS,
  DESTRUCTION_SUBJECTS,
} from '../destruction';
import { oneOf } from './sql-columns';

/**
 * Whoever can be named as having changed a row: what every area's actor
 * columns reference, so none of them reaches into accounts. Only the id, as any
 * further column would bring an area's rule down with it. Triggers on `users`
 * insert and delete it with its account; nothing else writes it.
 */
export const identities = pgTable('identities', {
  id: uuid('id').primaryKey(),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Which areas an external system may be handed (FR-ADM-10). An enum, as the
 * set is a rule in code and a value no guard knows must not be storable. */
export const ownershipArea = pgEnum('ownership_area', OWNERSHIP_AREAS);

/** The admin's switches, one row (the `id = 1` check); unlike `config/`,
 * changed at runtime. */
export const appSettings = pgTable(
  'app_settings',
  {
    id: integer('id').primaryKey().default(1),
    maintenanceMode: boolean('maintenanceMode').notNull().default(false),
    /** The areas owned from outside. An array, so a new area is an enum
     * value, not a column. Empty by default: nothing is handed over before
     * anything is set up to take it. */
    externallyOwnedAreas: ownershipArea('externallyOwnedAreas')
      .array()
      .notNull()
      .default(sql`'{}'`),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Null on the seeded row. */
    updatedBy: uuid('updatedBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [check('app_settings_singleton', sql`${t.id} = 1`)],
);

export const settingChangeKind = pgEnum(
  'setting_change_kind',
  SETTING_CHANGE_KINDS,
);

/**
 * Every change to a setting, kept: `app_settings` says only who touched the
 * row last. Somebody who turned the exchange off to fix a price and went home
 * leaves a week of stale catalogue that needs a name and a time.
 *
 * Append-only, so no `updatedAt`; the actor's email is copied so the trail
 * survives the account.
 */
export const settingChanges = pgTable('setting_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Insertion order, which is what the trail is read in: a wall clock can
   * step backwards, so `changedAt` cannot say it. */
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  kind: settingChangeKind('kind').notNull(),
  /** The area, for a setting that has them. Text, not the enum: a retired
   * area must still read back. */
  area: varchar('area', { length: 40 }),
  /** Which way the switch moved. A setting that is no switch gets its own
   * column. */
  enabled: boolean('enabled').notNull(),
  changedAt: timestamp('changedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  changedBy: uuid('changedBy').references(() => identities.id, {
    onDelete: 'set null',
  }),
  changedByEmail: varchar('changedByEmail', { length: 255 }),
});

/**
 * A record that personal data was destroyed (NFR-LEGAL-12), written in the
 * transaction that destroys it. It names the person by an id, never by the
 * data that went: an anonymized account's row keeps that id, a declined
 * registration's row is gone but its consent record carries the same one.
 *
 * No foreign keys, for the reason `consents.userId` has none: the row never
 * changes, and it outlives what it names. `destroyedBy` is the holder, the
 * staff member, or null for the retention sweep; a staff member's address is
 * copied as on a page save, the holder's never, since it is what went.
 *
 * Never updated, which a database trigger enforces, and deleted when its own
 * retention ends.
 */
export const destructionRecords = pgTable(
  'destruction_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subject: varchar('subject', { length: 16 }).notNull(),
    subjectId: uuid('subjectId').notNull(),
    categories: varchar('categories', { length: 32 }).array().notNull(),
    reason: varchar('reason', { length: 32 }).notNull(),
    destroyedBy: uuid('destroyedBy'),
    destroyedByEmail: varchar('destroyedByEmail', { length: 320 }),
    destroyedAt: timestamp('destroyedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'destruction_records_subject',
      oneOf('subject', DESTRUCTION_SUBJECTS),
    ),
    check('destruction_records_reason', oneOf('reason', DESTRUCTION_REASONS)),
    check(
      'destruction_records_categories',
      sql.raw(
        `cardinality("categories") > 0 and "categories" <@ array[${DESTRUCTION_CATEGORIES.map((c) => `'${c}'`).join(', ')}]::varchar[]`,
      ),
    ),
    index('destruction_records_destroyedAt_idx').on(t.destroyedAt),
    index('destruction_records_subjectId_idx').on(t.subjectId),
  ],
);
