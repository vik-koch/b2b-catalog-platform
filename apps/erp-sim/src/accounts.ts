import { seeded } from './random';

/** An account as the customer read reports it (docs/customer-machine-api.md §2). */
export interface Account {
  readonly id: string;
  readonly sourceId: string | null;
  readonly state: string;
  readonly createdAt: string;
}

/** How the back office takes on new customers (simulation.json's `accounts`). */
export interface AccountRules {
  /** Its own keys are this prefix and a number, `CUS-1001`. */
  readonly keyPrefix: string;
  /** The price lists a new customer is put on, one drawn per account; null
   * is the base list. */
  readonly tiers: readonly (string | null)[];
}

/** One row of a customer run that claims an account by its platform id. */
export interface ClaimRow {
  readonly sourceId: string;
  readonly accountId: string;
  readonly access: 'enabled';
  readonly tierKey: string | null;
}

/**
 * The back office's answer to every registration waiting on the storefront:
 * a counterparty of its own, so a key, claimed onto the account by the id the
 * read reported (`claimById`), and the account approved and put on a price
 * list in the same row.
 *
 * Keys continue from the highest of the prefix's numbers the book already
 * holds, oldest registration first, so the same book always gets the same
 * keys. A run held for a person, or never sent, leaves the accounts unkeyed,
 * and the next cycle proposes the same rows again. The price list is drawn
 * from the account's own id, so it does not change between cycles either.
 */
export function claimsFor(
  accounts: readonly Account[],
  rules: AccountRules,
): ClaimRow[] {
  const keyNumber = new RegExp(`^${escape(rules.keyPrefix)}(\\d+)$`);
  const highest = Math.max(
    1000,
    ...accounts.map((account) =>
      Number(keyNumber.exec(account.sourceId ?? '')?.[1] ?? 0),
    ),
  );
  return accounts
    .filter((account) => account.state === 'pending' && !account.sourceId)
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    .map((account, index) => ({
      sourceId: `${rules.keyPrefix}${highest + index + 1}`,
      accountId: account.id,
      access: 'enabled',
      tierKey:
        rules.tiers[Math.floor(seeded(account.id)() * rules.tiers.length)] ??
        null,
    }));
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
