import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { identities } from '../../platform/db/schema';
import { customerTiers } from '../catalog/catalog-schema';

/** A sign-up is a `user`; staff roles are given deliberately. */
export const userRole = pgEnum('user_role', ['admin', 'manager', 'user']);

/**
 * `pending`: registered, waiting for staff. `invited`: approved, with a tier
 * and a set-your-password link out but no password of its own. `active`: may
 * sign in, and only this one may (SessionAccounts). `anonymized`: erased by
 * its holder; the row stays because trails point at it.
 *
 * The status also says what a password link is for: an `invited` account sets
 * its first password, an `active` one resets it.
 */
export const userStatus = pgEnum('user_status', [
  'pending',
  'invited',
  'active',
  /** Switched off by staff, and back on again. Unlike `anonymized` it keeps
   * the name, so trails still point at somebody. */
  'disabled',
  'anonymized',
]);

/** What kind of customer registered (FR-AUTH-01), as declared. Evidence for
 * the approver, never a tier: a company can buy at retail volumes. */
export const customerType = pgEnum('customer_type', ['person', 'company']);

/** Plural, as `user` is reserved in Postgres. The email is the login. */
export const users = pgTable(
  'users',
  {
    /** Also the account's identity: triggers insert the `identities` row
     * before the account and delete it after, so every path, raw SQL
     * included, keeps the two one to one. */
    id: uuid('id')
      .primaryKey()
      .defaultRandom()
      .references(() => identities.id),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('passwordHash').notNull(),
    role: userRole('role').notNull().default('user'),
    /**
     * The source system's key, the only identity the exchange matches on
     * (FR-ADM-14): an email or a registration id can change or be shared. Staff
     * may see it; the storefront never does.
     *
     * Null for an account registered here and for staff. Kept when an account
     * is erased, so a later run meets a customer it must refuse rather than a
     * stranger it recreates (NFR-LEGAL-08).
     */
    sourceId: varchar('sourceId', { length: 255 }).unique(),
    /** `pending` by default: a forgotten status can lock an account out, never
     * let one in. */
    status: userStatus('status').notNull().default('pending'),
    /** Who registered, as they put it: what staff match against their records
     * to approve. Nullable, as staff accounts describe nobody and erasure clears
     * them. */
    firstName: varchar('firstName', { length: 200 }),
    lastName: varchar('lastName', { length: 200 }),
    phone: varchar('phone', { length: 50 }),
    customerType: customerType('customerType'),
    /** The party the account was approved on, and what a new address
     * prefills. Required for a `company` by the contract, not the column. An
     * address may still be invoiced to another of the customer's entities. */
    companyName: varchar('companyName', { length: 255 }),
    /** Stored normalised (the contract's form), so it matches the source
     * system's records however it was typed. */
    companyRegistrationId: varchar('companyRegistrationId', { length: 64 }),
    /** Set together by an approval or a staff-created account. */
    approvedAt: timestamp('approvedAt', { withTimezone: true }),
    approvedBy: uuid('approvedBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
    /** Null while the hash is the stand-in nobody holds, which is a real
     * argon2 hash and cannot be told apart otherwise. Decides where a reactivated
     * account lands: `active` with a password, `invited` without. */
    passwordSetAt: timestamp('passwordSetAt', { withTimezone: true }),
    /** When a session last started: a sign-in or a first password from a link.
     * A session runs for days, so this is last use to within that. */
    lastSignInAt: timestamp('lastSignInAt', { withTimezone: true }),
    /** When the holder last entered a code sent to `phone` (FR-AUTH-12); codes
     * go only to a confirmed number. A trigger clears it when a write changes
     * `phone` without setting this too, so no other path confirms a number. */
    phoneConfirmedAt: timestamp('phoneConfirmedAt', { withTimezone: true }),
    /** An admin let the account skip the code (FR-AUTH-12). Counts only while
     * the deployment allows exempting its role, so narrowing that needs no
     * write. */
    signInStepExemptAt: timestamp('signInStepExemptAt', { withTimezone: true }),
    signInStepExemptBy: uuid('signInStepExemptBy').references(
      () => identities.id,
      { onDelete: 'set null' },
    ),
    /** A remembered browser from before this skips nothing (FR-AUTH-12). A
     * trigger moves it when `phone` changes or the account is disabled or
     * anonymized. */
    devicesTrustedSince: timestamp('devicesTrustedSince', {
      withTimezone: true,
    }),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Raised on a password change; a session token carrying an older value is
     * refused. */
    tokenVersion: integer('tokenVersion').notNull().default(0),
    /** The password is one the holder did not choose: the bootstrap admin's,
     * or an admin's reset. */
    mustChangePassword: boolean('mustChangePassword').notNull().default(false),
    /**
     * The price list (FR-AUTH-05), independent of `role`. Null is the default
     * list and its only spelling: guests have no row at all, so pointing
     * accounts at the badged row too would give one state two forms. Restricts a
     * list's delete: moving a customer onto default prices silently is worse.
     */
    tierId: uuid('tierId').references(() => customerTiers.id, {
      onDelete: 'restrict',
    }),
  },
  (t) => [
    // A price list and a source key are a customer's: a staff account the
    // exchange could address is one it could tier, disable or re-mail.
    check(
      'users_customer_only_fields',
      sql`${t.role} = 'user' OR (${t.tierId} IS NULL AND ${t.sourceId} IS NULL)`,
    ),
    // Only on a company, or a person's orders would quote them. Not the
    // reverse: a company registered before `companyName` existed has none.
    check(
      'users_company_fields_on_companies',
      sql`${t.customerType} IS NOT DISTINCT FROM 'company' OR (${t.companyName} IS NULL AND ${t.companyRegistrationId} IS NULL)`,
    ),
  ],
);

/**
 * Single-use links to set a password: the invitation on approval
 * (FR-AUTH-01/03) and a requested reset (FR-AUTH-02). What a link does is read
 * from the account's status, so an expired invitation followed by a reset
 * still lands on "choose your password".
 *
 * Only the SHA-256 of the token is kept, so a leaked database yields no links.
 * Not argon2: 256 random bits need no slow hash, and a deterministic one lets
 * the link be found by itself, with no row id beside the secret.
 */
export const passwordTokens = pgTable('password_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId')
    .notNull()
    // A purged registration takes its open invitation with it.
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('tokenHash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  /** Kept on redemption, so a second click says "already used" rather than
   * "never existed". */
  usedAt: timestamp('usedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** A sign-in's second step, or confirming the number the code goes to, which
 * writes it to the account. */
export const signInCodePurpose = pgEnum('sign_in_code_purpose', [
  'sign-in',
  'confirm',
]);

/**
 * The one code or call check an account is waiting on (FR-AUTH-12). One row
 * per account: a new sign-in reuses an open one rather than paying for
 * another.
 *
 * A code keeps only its SHA-256; a call keeps the provider's reference, which
 * never leaves the API, and the number to call, so a repeated sign-in shows it
 * again. `phone` is kept because confirming writes it, and `sends` carries
 * over to a replacement row, so a new number does not reset the limit.
 */
export const signInCodes = pgTable(
  'sign_in_codes',
  {
    userId: uuid('userId')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: signInCodePurpose('purpose').notNull(),
    phone: varchar('phone', { length: 50 }).notNull(),
    codeHash: varchar('codeHash', { length: 64 }),
    callReference: varchar('callReference', { length: 200 }),
    callTo: varchar('callTo', { length: 50 }),
    attempts: integer('attempts').notNull().default(0),
    sends: integer('sends').notNull().default(1),
    sentAt: timestamp('sentAt', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  },
  (t) => [
    // A code or a call, never both or neither; a call has its number.
    check(
      'sign_in_codes_one_kind',
      sql`(${t.codeHash} IS NULL) <> (${t.callReference} IS NULL)
        AND (${t.callReference} IS NULL) = (${t.callTo} IS NULL)`,
    ),
  ],
);

/**
 * The account's address book (FR-CART-04), always read through its account.
 * A row is a place with no identity: who an order is invoiced to is the
 * order's own field. Nor is it typed as delivery or billing: one address
 * usually serves both, and checkout picks per order. Without a `label` it
 * shows by its first line.
 */
export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('userId')
      .notNull()
      // Orders keep their own copy of the address, so the book can go.
      .references(() => users.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 100 }),
    /** As printed, house number included. */
    street: varchar('street', { length: 255 }).notNull(),
    street2: varchar('street2', { length: 255 }),
    postalCode: varchar('postalCode', { length: 32 }).notNull(),
    city: varchar('city', { length: 255 }).notNull(),
    region: varchar('region', { length: 255 }),
    /** ISO 3166-1 alpha-2, as orders copy it and `DE` beside `Deutschland`
     * groups nothing. The accepted codes are deployment config. */
    country: varchar('country', { length: 2 }).notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('addresses_userId_idx').on(t.userId)],
);
