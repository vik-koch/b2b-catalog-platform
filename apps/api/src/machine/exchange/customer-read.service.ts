import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CustomerAccountRecord,
  CustomerAccountState,
  CustomerAccountsPage,
  ListCustomerAccountsQuery,
} from '@b2b-catalog-platform/shared/machine/exchange';
import { UserStatus } from '@b2b-catalog-platform/shared/core/accounts';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import { customerTiers, users } from '../../db/schema';
import { encodeMachineCursor, parseMachineCursor } from './machine-cursor';

/**
 * The outbound read of customer accounts (FR-ADM-18). Gated by the token's
 * `customer-read` scope alone, the "configured rather than assumed" of
 * NFR-LEGAL-07.
 */
@Injectable()
export class CustomerReadService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * One page, oldest change first: a puller asks what moved since it last
   * asked. `id` breaks the tie, since one run writes accounts in the same
   * microsecond, or a cursor repeats or loses rows.
   */
  async listAccounts(
    query: ListCustomerAccountsQuery,
  ): Promise<CustomerAccountsPage> {
    const after = parseMachineCursor(query.cursor);
    const rows = await this.db
      .select({
        id: users.id,
        sourceId: users.sourceId,
        status: users.status,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        customerType: users.customerType,
        companyName: users.companyName,
        companyRegistrationId: users.companyRegistrationId,
        tierKey: customerTiers.key,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        // `updatedAt` at full precision for the cursor; see `machine-cursor`.
        cursorAt: sql<string>`${users.updatedAt}::text`,
      })
      .from(users)
      .leftJoin(customerTiers, eq(customerTiers.id, users.tierId))
      .where(
        and(
          // Staff are never customers, and nobody else's business.
          eq(users.role, 'user'),
          query.since ? gte(users.updatedAt, new Date(query.since)) : undefined,
          // One row comparison, so the index that serves the sort serves the
          // seek.
          after
            ? sql`(${users.updatedAt}, ${users.id}) > (${after.updatedAt}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(asc(users.updatedAt), asc(users.id))
      // One more than asked for says whether there is a next page.
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      accounts: page.map(toRecord),
      nextCursor:
        rows.length > query.limit && last
          ? encodeMachineCursor(last.cursorAt, last.id)
          : null,
    };
  }
}

type AccountRow = {
  id: string;
  sourceId: string | null;
  status: UserStatus;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  customerType: CustomerAccountRecord['customerType'];
  companyName: string | null;
  companyRegistrationId: string | null;
  tierKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  cursorAt: string;
};

/**
 * A withdrawn account keeps its keys, state and dates and loses the rest,
 * including the placeholder address the row carries. It stays listed: one
 * that stopped appearing reads as a filtered export (NFR-LEGAL-07).
 */
function toRecord(row: AccountRow): CustomerAccountRecord {
  const withdrawn = row.status === 'anonymized';
  return {
    id: row.id,
    sourceId: row.sourceId,
    state: stateOf(row.status),
    email: withdrawn ? null : row.email,
    firstName: withdrawn ? null : row.firstName,
    lastName: withdrawn ? null : row.lastName,
    phone: withdrawn ? null : row.phone,
    customerType: withdrawn ? null : row.customerType,
    companyName: withdrawn ? null : row.companyName,
    companyRegistrationId: withdrawn ? null : row.companyRegistrationId,
    tierKey: withdrawn ? null : row.tierKey,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function stateOf(status: UserStatus): CustomerAccountState {
  return status === 'anonymized' ? 'withdrawn' : status;
}
