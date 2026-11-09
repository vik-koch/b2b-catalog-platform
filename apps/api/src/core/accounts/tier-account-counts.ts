import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';

import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';
import { TierAccounts } from '../catalog/tier-accounts';
import { users } from './accounts-schema';

@Injectable()
export class TierAccountCounts implements TierAccounts {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async customersByTier(): Promise<Map<string | null, number>> {
    const rows = await this.db
      .select({ tierId: users.tierId, customers: count() })
      .from(users)
      .where(and(eq(users.role, 'user'), eq(users.status, 'active')))
      .groupBy(users.tierId);
    return new Map(rows.map((row) => [row.tierId, Number(row.customers)]));
  }

  countOn(tierId: string): Promise<number> {
    return this.db.$count(users, eq(users.tierId, tierId));
  }
}
