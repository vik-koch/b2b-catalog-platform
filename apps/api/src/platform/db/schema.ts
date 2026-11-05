import { sql } from 'drizzle-orm';
import {
  SETTING_CHANGE_KINDS,
  OWNERSHIP_AREAS,
} from '@b2b-catalog-platform/shared/platform';
import {
  DESTRUCTION_CATEGORIES,
  DESTRUCTION_REASONS,
  DESTRUCTION_SUBJECTS,
} from '../destruction';
import {
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
import { oneOf } from './sql-columns';
import { users } from '../../core/accounts/accounts-schema';

/**
 * Which areas an external system may be handed (FR-ADM-10). A Postgres enum
 * for the same reason `api_token_scope` is one: the set is a rule in code, and
 * a value nobody wrote a guard for should not be storable.
 */
export const ownershipArea = pgEnum('ownership_area', OWNERSHIP_AREAS);

/**
 * Runtime application settings — a deliberate singleton (the `id = 1` check
 * permits exactly one row). This is mutable admin-toggled state, distinct from
 * the boot-time per-deployment `config/` surface.
 */
export const appSettings = pgTable(
  'app_settings',
  {
    id: integer('id').primaryKey().default(1),
    maintenanceMode: boolean('maintenanceMode').notNull().default(false),
    // The areas currently owned from outside. An array rather than a column
    // per area: iteration 13 hands over order processing by adding a value to
    // the enum, not a migration to this table. Empty is the default and the
    // only sane one for a fresh deployment — nothing has been handed over
    // before anyone has configured anything to hand it to.
    externallyOwnedAreas: ownershipArea('externallyOwnedAreas')
      .array()
      .notNull()
      .default(sql`'{}'`),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Who last changed a setting, for audit. Null for the seeded default row.
    updatedBy: uuid('updatedBy').references(() => users.id, {
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
 * Every change to a runtime setting, kept.
 *
 * `app_settings` is a singleton carrying one `updatedBy`/`updatedAt` for the
 * whole row, which answers "who touched a setting last" and nothing else — and
 * once there were two settings in it, not even that unambiguously. The
 * question this table exists for is the one the ownership switch creates:
 * somebody turned the exchange off to fix a price and went home, and a week of
 * a stale catalog needs a name and a time against it.
 *
 * Append-only. Nothing updates or deletes a row here, so no `updatedAt` and no
 * soft delete; the actor is denormalized like every other audit row here so
 * the trail survives the account.
 */
export const settingChanges = pgTable('setting_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: settingChangeKind('kind').notNull(),
  // Which area, for a setting that has parts; null for one that does not.
  // Deliberately text rather than the `ownership_area` enum: this row is a
  // record of what happened, and a retired area name must still read back.
  area: varchar('area', { length: 40 }),
  // Which way it was moved. Both settings are switches; a setting that is not
  // one gets its own column rather than a stringly-typed value here.
  enabled: boolean('enabled').notNull(),
  changedAt: timestamp('changedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  changedBy: uuid('changedBy').references(() => users.id, {
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
