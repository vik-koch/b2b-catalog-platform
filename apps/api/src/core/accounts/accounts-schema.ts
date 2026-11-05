import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
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
import { customerTiers } from '../catalog/catalog-schema';

// New signups default to `user`; `admin`/`manager` are assigned deliberately.
export const userRole = pgEnum('user_role', ['admin', 'manager', 'user']);

// Account lifecycle. `pending` = self-registered, waiting for staff approval.
// `invited` = staff approved it and a set-your-password link is out; the tier
// is assigned but the account still has no password of its own. `active` = the
// link was redeemed and the account can sign in. `anonymized` = self-deleted:
// the row survives because audit entries and the `updatedBy` columns point at
// it, but it can never sign in again.
//
// Only `active` may authenticate — see JwtAuthGuard. The state also tells a
// password token what it is *for* without the token carrying a purpose: a link
// redeemed by an `invited` account sets a first password, one redeemed by an
// `active` account resets an existing one.
export const userStatus = pgEnum('user_status', [
  'pending',
  'invited',
  'active',
  // Switched off by staff and switchable back on: the person who left, the
  // customer who stopped ordering. Distinct from `anonymized`, which erases
  // who they were — a deactivated account keeps its name so the audit trail
  // and every approvedBy/updatedBy reference still point at somebody.
  'disabled',
  'anonymized',
]);

// What kind of customer registered (FR-AUTH-01). Declared by the registrant and
// left as declared: it is evidence for the staff member approving the account,
// never an automatic tier assignment (ADR 0031 — a company can buy at retail
// volumes, and no tier is a default).
export const customerType = pgEnum('customer_type', ['person', 'company']);

// Plural table name (the singular `user` is a Postgres reserved word, awkward in
// the raw-SQL seed/bootstrap statements). Email is the login identifier.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  role: userRole('role').notNull().default('user'),
  // The source system's own key for this customer, and the only identity the
  // exchange matches on (FR-ADM-14) — never the email address, never the
  // registration id, both of which a person can change and two people can
  // share. Private: readable and editable by staff, never serialized to the
  // storefront, exactly as a product's is (ADR 0054).
  //
  // Null for everyone who registered here and everyone who is not a customer:
  // a staff account is not a customer and the exchange never sees one. Kept
  // when an account is deleted and the rest of the row is cleared, so a later
  // run meets a customer it must refuse rather than a stranger it recreates
  // (NFR-LEGAL-08).
  sourceId: varchar('sourceId', { length: 255 }).unique(),
  // Defaults to `pending`, the safe end: an account only becomes usable when
  // something sets `active` deliberately (staff approval, or the bootstrap
  // admin insert). A forgotten status can lock an account out, never let one in.
  status: userStatus('status').notNull().default('pending'),
  // Who registered, as they described themselves. This is what makes approval a
  // decidable act: staff match these against their own customer records, and a
  // pending account has no way to be asked anything. All nullable — staff
  // accounts are created by other staff and describe nobody, and
  // anonymization clears every one of them.
  firstName: varchar('firstName', { length: 200 }),
  lastName: varchar('lastName', { length: 200 }),
  phone: varchar('phone', { length: 50 }),
  customerType: customerType('customerType'),
  // The invoiced party, as the customer gave it. Both are required for a
  // `company` registration — enforced by the registration contract, not by the
  // columns, since staff accounts describe nobody and rows predating this
  // carry only the number.
  //
  // The name is here as well as on an address because an address may be
  // invoiced to another of the customer's entities; this is the one the account
  // was approved on, and what a new address prefills from.
  companyName: varchar('companyName', { length: 255 }),
  // Business registration number, stored normalized (no spaces, upper case —
  // see the contract) so it matches the legacy system's records regardless of
  // how it was typed.
  companyRegistrationId: varchar('companyRegistrationId', { length: 64 }),
  // Set together when staff approve an account (or create one outright). Null
  // on the bootstrap admin and on rows that predate registration.
  approvedAt: timestamp('approvedAt', { withTimezone: true }),
  approvedBy: uuid('approvedBy').references((): AnyPgColumn => users.id, {
    onDelete: 'set null',
  }),
  // When the account holder last chose a password of their own — null while
  // the stored hash is the unusable stand-in nobody holds. It is the only way
  // to tell those two apart, since the stand-in is a real argon2 hash by
  // design, and it is what decides where a reactivated account lands: back to
  // `active` if it has a password, to `invited` if it never chose one.
  passwordSetAt: timestamp('passwordSetAt', { withTimezone: true }),
  // When a session last started: a sign-in, or the first password chosen
  // from an invitation or a reset link. Recorded so that a later rule can
  // end an account nobody has used for a period, and null for every account
  // that has not signed in since recording began. A session runs for days,
  // so this is when the account was last used to within that.
  lastSignInAt: timestamp('lastSignInAt', { withTimezone: true }),
  // When the holder last entered a code sent to `phone` (FR-AUTH-12). A code
  // goes only to a confirmed number. A trigger clears this whenever `phone`
  // changes in a write that does not set it too, so a number changed by staff,
  // by an external system or by anonymization is never taken as confirmed.
  phoneConfirmedAt: timestamp('phoneConfirmedAt', { withTimezone: true }),
  // An admin let this account sign in without the code (FR-AUTH-12), and who.
  // Counts only while the deployment lets the account's role be exempted, so
  // narrowing that list takes effect without touching the rows.
  signInStepExemptAt: timestamp('signInStepExemptAt', { withTimezone: true }),
  signInStepExemptBy: uuid('signInStepExemptBy').references(
    (): AnyPgColumn => users.id,
    { onDelete: 'set null' },
  ),
  // A remembered browser issued before this skips nothing (FR-AUTH-12). A
  // trigger moves it when `phone` changes or the account is disabled or
  // anonymized, so every path that does either forgets them all.
  devicesTrustedSince: timestamp('devicesTrustedSince', {
    withTimezone: true,
  }),
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
  // The pricing group (FR-AUTH-05) — independent of `role`, which is
  // authorization only. Null is a normal, permanent state, not a placeholder:
  // it means the default list, which is what staff and any customer not put in
  // a specific tier get. Null stays the only spelling of that — guests have no
  // account at all, so the null case exists regardless, and pointing accounts
  // at the badged row as well would give one state two representations.
  // Restricted, not nulled, on tier delete: silently moving a customer onto
  // default prices is worse than refusing the delete.
  tierId: uuid('tierId').references(() => customerTiers.id, {
    onDelete: 'restrict',
  }),
});

/**
 * Single-use links that let someone set a password without one being mailed to
 * them: the invitation staff send on approval (FR-AUTH-01/03) and the reset a
 * visitor asks for (FR-AUTH-02). One table for both — what a link *means* is
 * read from the account's status, not stored here, so an expired invitation
 * followed by a reset request still lands on "choose your password".
 *
 * Only the SHA-256 of the token is stored, never the token: whoever holds the
 * link holds the credential, and a leaked database must not yield working
 * links. SHA-256 rather than argon2 precisely because it is deterministic —
 * the token is 256 bits of randomness, so it needs no slow KDF, and a
 * deterministic hash is what lets the link be looked up by itself instead of
 * carrying a row id beside the secret.
 */
export const passwordTokens = pgTable('password_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId')
    .notNull()
    // A purged registration takes its unredeemed invitation with it.
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('tokenHash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  // Set on redemption. Kept rather than deleted so a second click on the same
  // link can say "already used" instead of "never existed".
  usedAt: timestamp('usedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// What a sign-in code is for: the second step of a sign-in, or confirming the
// number it is sent to, which writes that number to the account on success.
export const signInCodePurpose = pgEnum('sign_in_code_purpose', [
  'sign-in',
  'confirm',
]);

/**
 * The one code or call check an account is waiting on (FR-AUTH-12, ADR 0066).
 * One row per account: a new sign-in while one is open reuses it rather than
 * paying for another.
 *
 * A code row keeps only the SHA-256 of the code. A call row keeps the
 * provider's reference, which never leaves the API, and the number to call,
 * so a repeated sign-in can show it again. The phone is kept because
 * confirming writes it to the account, and the sends carry over to a
 * replacement row, so changing the number does not reset the send limit.
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
    // A code or a call, never both and never neither; a call has its number.
    check(
      'sign_in_codes_one_kind',
      sql`(${t.codeHash} IS NULL) <> (${t.callReference} IS NULL)
        AND (${t.callReference} IS NULL) = (${t.callTo} IS NULL)`,
    ),
  ],
);

/**
 * The account's address book (FR-CART-04) — where its orders are delivered and
 * invoiced. Rows belong to one account and are always read through its id.
 *
 * A row is a **place**, and carries no identity: who an order is invoiced to is
 * a field of the order (ADR 0039), not a property of the address it is sent to.
 * `label` is an optional name for it — an address the customer never bothered
 * to name is shown by its own first line.
 *
 * Rows are **not typed** as delivery or billing either. The same address usually
 * serves both, and a stored role would be a second source of truth that the row
 * itself contradicts the moment it is edited. Checkout picks a role per order.
 */
export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('userId')
      .notNull()
      // Deleting an account takes its book with it; orders keep their own
      // snapshot of the address, so nothing readable is lost.
      .references(() => users.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 100 }),
    // An address is a place, and carries no identity: who an order is invoiced
    // to is the order's own field, resolved from the account or typed, never
    // merged into the row a customer picked.
    // The street line as it is printed, house number included.
    street: varchar('street', { length: 255 }).notNull(),
    street2: varchar('street2', { length: 255 }),
    postalCode: varchar('postalCode', { length: 32 }).notNull(),
    city: varchar('city', { length: 255 }).notNull(),
    region: varchar('region', { length: 255 }),
    // ISO 3166-1 alpha-2. A code, not free text: it is snapshotted onto orders,
    // and a column that reads `DE` on one and `Deutschland` on the next is one
    // nobody can group by. Which codes are accepted is deployment config.
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
