import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { Client } from 'pg';
import { AccountSeed, SeedBundle, TierSeed } from './bundle';

/**
 * The demo accounts and the price lists they buy from (FR-AUTH-05).
 *
 * Two different kinds of idempotency, on purpose:
 *
 *  - the tiers and their prices are **upserted**, like the catalog content
 *    beside them, so a re-seed brings a demo stack back to the prices it
 *    advertises;
 *  - the accounts are **create-if-missing**, like the bootstrap admin, because
 *    they are people: whoever clicked around the demo and approved a pending
 *    registration keeps that decision through the next deploy.
 */
export async function seedAccounts(
  client: Client,
  { accounts, catalog }: Pick<SeedBundle, 'accounts' | 'catalog'>,
): Promise<void> {
  const tierIds = new Map<string, string>();
  for (const tier of accounts.tiers) {
    const tierId = await upsertTier(client, tier);
    tierIds.set(tier.key, tierId);
    await upsertTierPrices(client, tier, tierId, catalog.products);
  }

  // Both hashes computed once and shared by every row that needs them. Sharing
  // is fine and self-documenting here — these are fixtures, and the accounts
  // that can sign in all share the published demo password anyway.
  const demoHash = await hash(accounts.password);
  // Nobody holds this one: an argon2 hash of a secret that is discarded the
  // moment it is used, which is how the app itself parks an account that has no
  // password yet (pending, invited) or may never have one again (disabled,
  // anonymized). A real hash rather than a sentinel — argon2 throws on a
  // malformed one, and a login attempt must fail, not error.
  const unusableHash = await hash(randomBytes(32).toString('hex'));

  // Staff first: they are the approver every approved customer points at.
  for (const [index, account] of accounts.accounts.entries()) {
    if (account.role === 'user') continue;
    await insertAccount(client, account, index, {
      demoHash,
      unusableHash,
      tierIds,
    });
  }

  const managerEmails = accounts.accounts
    .filter((account) => account.role === 'manager')
    .map((account) => account.email);
  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM users WHERE email = ANY($1) ORDER BY email LIMIT 1',
    [managerEmails],
  );
  const approverId = rows[0]?.id ?? null;

  for (const [index, account] of accounts.accounts.entries()) {
    if (account.role !== 'user') continue;
    await insertAccount(client, account, index, {
      demoHash,
      unusableHash,
      tierIds,
      approverId,
    });
  }
}

async function upsertTier(client: Client, tier: TierSeed): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO customer_tiers (key, label, "sortOrder") VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET
       label = EXCLUDED.label, "sortOrder" = EXCLUDED."sortOrder",
       "updatedAt" = now()
     RETURNING id`,
    [tier.key, tier.label, tier.sortOrder],
  );
  return rows[0].id;
}

/**
 * The tier's price for a product, or null where the tier does not price it.
 * Rounded down to the tier's step, which is how a real price list reads, but
 * never to nothing: a price of zero is no price at all.
 */
function tierPriceMinor(
  tier: TierSeed,
  categoryKey: string,
  priceMinor: number,
): number | null {
  const discount = tier.discounts[categoryKey];
  if (discount === undefined) return null;
  const step = tier.roundToMinor ?? 10;
  return Math.max(1, Math.floor((priceMinor * (1 - discount)) / step) * step);
}

/**
 * The tier prices the demo advertises. Only the categories the discount table
 * names get a row — the rest fall back to the default list's price, which is
 * the behaviour worth being able to see on the demo.
 */
async function upsertTierPrices(
  client: Client,
  tier: TierSeed,
  tierId: string,
  products: SeedBundle['catalog']['products'],
): Promise<void> {
  for (const product of products) {
    const priceMinor = tierPriceMinor(
      tier,
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
  tierIds: ReadonlyMap<string, string>;
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
  { demoHash, unusableHash, tierIds, approverId = null }: Context,
): Promise<void> {
  const tierId = account.tier === null ? null : tierIds.get(account.tier);
  if (tierId === undefined) {
    throw new Error(
      `Seed account ${account.email} names unknown tier ${account.tier}`,
    );
  }
  // Spread the timestamps, so the account list (newest first) has an order
  // worth looking at instead of one indistinguishable block.
  const ageInDays = index * 3 + 1;
  const approved = wasApproved(account);

  await client.query(
    `INSERT INTO users (
       id, email, "passwordHash", role, status,
       "firstName", "lastName", phone, "customerType", "companyRegistrationId",
       "tierId", "approvedAt", "approvedBy", "createdAt", "updatedAt",
       "passwordSetAt", "sourceId")
     VALUES (
       coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       $11, $12, $13, now() - make_interval(days => $14::int),
       now() - make_interval(days => $14::int),
       -- Only the accounts that hold the demo password have chosen one.
       case when $15::boolean then now() - make_interval(days => $14::int) end,
       $16)
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
      tierId,
      approved ? new Date(Date.now() - ageInDays * 86_400_000) : null,
      approved ? approverId : null,
      ageInDays,
      canSignIn(account),
      account.sourceId ?? null,
    ],
  );
}
