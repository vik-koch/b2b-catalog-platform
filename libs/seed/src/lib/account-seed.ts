import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { Client } from 'pg';
import {
  accountSeeds,
  DEMO_PASSWORD,
  managerEmails,
  wholesalePriceMinor,
  wholesaleTier,
  type AccountSeed,
} from './account-data';
import { productSeeds } from './catalog-data';

/**
 * The demo accounts and the wholesale price list they buy from (FR-AUTH-05).
 *
 * Two different kinds of idempotency, on purpose:
 *
 *  - the tier and its prices are **upserted**, like the catalog content beside
 *    them, so a re-seed brings a demo stack back to the prices it advertises;
 *  - the accounts are **create-if-missing**, like the bootstrap admin, because
 *    they are people: whoever clicked around the demo and approved a pending
 *    registration keeps that decision through the next deploy.
 */
export async function seedAccounts(client: Client): Promise<void> {
  const tierId = await upsertWholesaleTier(client);
  await upsertWholesalePrices(client, tierId);

  // Both hashes computed once and shared by every row that needs them. Sharing
  // is fine and self-documenting here — these are fixtures, and the accounts
  // that can sign in all share the published demo password anyway.
  const demoHash = await hash(DEMO_PASSWORD);
  // Nobody holds this one: an argon2 hash of a secret that is discarded the
  // moment it is used, which is how the app itself parks an account that has no
  // password yet (pending, invited) or may never have one again (disabled,
  // anonymized). A real hash rather than a sentinel — argon2 throws on a
  // malformed one, and a login attempt must fail, not error.
  const unusableHash = await hash(randomBytes(32).toString('hex'));

  // Staff first: they are the approver every approved customer points at.
  for (const [index, account] of accountSeeds.entries()) {
    if (account.role === 'user') continue;
    await insertAccount(client, account, index, {
      demoHash,
      unusableHash,
      tierId,
    });
  }

  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM users WHERE email = ANY($1) ORDER BY email LIMIT 1',
    [managerEmails],
  );
  const approverId = rows[0]?.id ?? null;

  for (const [index, account] of accountSeeds.entries()) {
    if (account.role !== 'user') continue;
    await insertAccount(client, account, index, {
      demoHash,
      unusableHash,
      tierId,
      approverId,
    });
  }
}

async function upsertWholesaleTier(client: Client): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO customer_tiers (key, label, "sortOrder") VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET
       label = EXCLUDED.label, "sortOrder" = EXCLUDED."sortOrder",
       "updatedAt" = now()
     RETURNING id`,
    [wholesaleTier.key, wholesaleTier.label, wholesaleTier.sortOrder],
  );
  return rows[0].id;
}

/**
 * The tier prices the demo advertises. Only the categories the discount table
 * names get a row — the rest fall back to `products.defaultPriceMinor`, which
 * is the behaviour worth being able to see on the demo.
 */
async function upsertWholesalePrices(
  client: Client,
  tierId: string,
): Promise<void> {
  for (const product of productSeeds) {
    const priceMinor = wholesalePriceMinor(
      product.categoryKey,
      product.priceMinor,
    );
    if (priceMinor === null) continue;

    await client.query(
      `INSERT INTO product_prices ("productId", "tierId", "priceMinor")
       SELECT id, $1, $2 FROM products WHERE "sourceId" = $3
       ON CONFLICT ("productId", "tierId") DO UPDATE SET
         "priceMinor" = EXCLUDED."priceMinor", "updatedAt" = now()`,
      [tierId, priceMinor, product.sourceId],
    );
  }
}

interface Context {
  demoHash: string;
  unusableHash: string;
  tierId: string;
  approverId?: string | null;
}

/** Only these have chosen a password and can sign in. */
const canSignIn = (account: AccountSeed) => account.status === 'active';

/**
 * Everything a staff member has ever decided on. `pending` is the one status
 * that carries neither approver nor tier — it is a request, not a customer.
 * `anonymized` keeps both: self-deletion erases who the person was, not the
 * fact that somebody once approved them.
 */
const wasApproved = (account: AccountSeed) => account.status !== 'pending';

async function insertAccount(
  client: Client,
  account: AccountSeed,
  index: number,
  { demoHash, unusableHash, tierId, approverId = null }: Context,
): Promise<void> {
  // Spread the timestamps, so the account list (newest first) has an order
  // worth looking at instead of one indistinguishable block.
  const ageInDays = index * 3 + 1;
  const approved = wasApproved(account);

  await client.query(
    `INSERT INTO users (
       id, email, "passwordHash", role, status,
       "firstName", "lastName", phone, "customerType", "companyRegistrationId",
       "tierId", "approvedAt", "approvedBy", "createdAt", "updatedAt")
     VALUES (
       coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13, now() - make_interval(days => $14::int),
       now() - make_interval(days => $14::int))
     -- Untargeted, because an account is identified by two unique columns and
     -- create-if-missing means "leave whatever is already there" for either.
     -- The tombstone carries a fixed id, so a stack seeded before its address
     -- was last edited holds that id under the old email: an (email) arbiter
     -- finds nothing to skip, inserts, and dies on the primary key instead.
     ON CONFLICT DO NOTHING`,
    [
      account.id ?? null,
      account.email,
      canSignIn(account) ? demoHash : unusableHash,
      account.role,
      account.status,
      account.firstName,
      account.lastName,
      account.phone,
      account.customerType,
      account.companyRegistrationId,
      account.wholesale ? tierId : null,
      approved ? new Date(Date.now() - ageInDays * 86_400_000) : null,
      approved ? approverId : null,
      ageInDays,
    ],
  );
}
