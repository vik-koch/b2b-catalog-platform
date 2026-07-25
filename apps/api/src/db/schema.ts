import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const pages = pgTable('pages', {
  // The primary key IS the public slug (fixed set, see shared PAGE_SLUGS).
  id: varchar('id', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  // Always sanitized: nothing writes here without passing through
  // sanitizeRichText — neither the admin endpoint nor the seed.
  bodyHtml: text('bodyHtml').notNull(),
  // No `createdAt`: rows are seeded, never created, so it would only record the
  // seed date. `updatedAt` is shown publicly as the page's last-changed date.
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Who last edited, for audit. Null for never-edited seeded content. No
  // version history is kept — this is the whole audit trail.
  updatedBy: uuid('updatedBy').references(() => users.id, {
    onDelete: 'set null',
  }),
});

// New signups default to `user`; `admin`/`manager` are assigned deliberately.
export const userRole = pgEnum('user_role', ['admin', 'manager', 'user']);

// Plural table name (the singular `user` is a Postgres reserved word, awkward in
// the raw-SQL seed/bootstrap statements). Email is the login identifier.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  role: userRole('role').notNull().default('user'),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Incremented on password change. The signed session token embeds the value
  // it was issued with; the auth guard rejects a token whose version no longer
  // matches.
  tokenVersion: integer('tokenVersion').notNull().default(0),
  // True while the account still carries a password it did not choose itself:
  // the bootstrap admin's seeded one, and later any admin-issue reset.
  // Cleared by setPassword.
  mustChangePassword: boolean('mustChangePassword').notNull().default(false),
});
