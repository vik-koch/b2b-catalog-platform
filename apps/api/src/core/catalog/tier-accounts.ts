/**
 * What catalog asks about the accounts on its price lists. Catalog may not
 * import accounts, so accounts answers through this and the app root wires it.
 */
export interface TierAccounts {
  /** Active customers per tier id, the badged list's under `null`: staff,
   * pending requests and anonymized accounts are sold nothing. */
  customersByTier(): Promise<Map<string | null, number>>;
  /** Every account on the tier, whatever its role or state: what the
   * restricting foreign key counts. */
  countOn(tierId: string): Promise<number>;
}

export const TIER_ACCOUNTS = 'TIER_ACCOUNTS';
