import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CustomerAccountRecord,
  CustomerAccountState,
  CustomerAccountsPage,
  ListCustomerAccountsQuery,
  UserStatus,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { customerTiers, users } from '../db/schema';

/**
 * The outbound read of customer accounts (FR-ADM-18).
 *
 * Its own service, beside the exchange rather than inside it, because it
 * answers a different question under a different rule: the exchange writes
 * while an external system owns the area, and this reads whether or not
 * anybody does. A system being prepared for a go-live spends weeks reading
 * before it is ever handed the pen, and the account this route exists to reveal
 * — somebody who registered on the storefront and has no source key — only
 * exists in the first place because nobody outside could see it.
 *
 * Nothing here writes, and nothing here is refused by a setting: what gates it
 * is the token an admin issued with the `customer-read` capability on it, which
 * is the "configured rather than assumed" NFR-LEGAL-07 asks for.
 */
@Injectable()
export class CustomerReadService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * One page of customer accounts, oldest change first.
   *
   * Ordered and paged on `updatedAt`, because the one call a scheduled puller
   * actually makes is "everything that has moved since I last asked". `id`
   * breaks the tie: two accounts written by the same run share a timestamp to
   * the microsecond often enough, and a cursor over a non-unique ordering
   * either repeats rows or loses them.
   */
  async listAccounts(
    query: ListCustomerAccountsQuery,
  ): Promise<CustomerAccountsPage> {
    const after = parseCursor(query.cursor);
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
        // The same instant as `updatedAt`, at the precision Postgres actually
        // stores it. The driver hands the column back as a JS Date, whose
        // milliseconds are three digits short of a `timestamptz`'s
        // microseconds — and a cursor built from the rounded-down value
        // re-selects the row it was meant to move past, so the boundary row of
        // every page came back twice. Only the cursor needs this; the field
        // the client reads stays an ordinary ISO timestamp.
        cursorAt: sql<string>`${users.updatedAt}::text`,
      })
      .from(users)
      .leftJoin(customerTiers, eq(customerTiers.id, users.tierId))
      .where(
        and(
          // Staff are never customers under any setting (FR-ADM-10), and who
          // administers the shop is nobody else's business.
          eq(users.role, 'user'),
          query.since ? gte(users.updatedAt, new Date(query.since)) : undefined,
          // Row comparison rather than two clauses: it is the ordering written
          // down once, so the index that serves the sort serves the seek.
          after
            ? sql`(${users.updatedAt}, ${users.id}) > (${after.updatedAt}::timestamptz, ${after.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(asc(users.updatedAt), asc(users.id))
      // One more than asked for, purely to find out whether there is a next
      // page. Cheaper than a count over a table being written to, and exact.
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      accounts: page.map(toRecord),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor(last.cursorAt, last.id)
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
 * One row as the outside is owed it.
 *
 * A withdrawn account keeps its two keys, its state and its dates, and loses
 * everything else — including the `deleted-<id>@deleted.invalid` placeholder
 * the row still carries, which is a syntactically valid address the staff list
 * needs and a thing no receiving system should be handed as somebody's email.
 * It stays in the listing rather than disappearing from it because a customer
 * who merely stopped appearing reads as an export that was filtered, and the
 * point of reporting a withdrawal is that it is reported (NFR-LEGAL-07).
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

/**
 * The cursor: the ordering, written down and made unappetising to read.
 *
 * Base64 rather than the two values in the clear, so a client that would
 * otherwise have parsed it is not quietly depending on an ordering this route
 * is free to change.
 */
function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(`${updatedAt}|${id}`).toString('base64url');
}

function parseCursor(
  cursor: string | undefined,
): { updatedAt: string; id: string } | undefined {
  if (!cursor) return undefined;
  const [updatedAt, id, ...rest] = Buffer.from(cursor, 'base64url')
    .toString('utf8')
    .split('|');
  // Handed back to Postgres as text and cast there, so the value that comes
  // out of a row is the value that goes into the next query — no timestamp is
  // ever parsed and re-printed in between.
  if (
    rest.length > 0 ||
    !id ||
    !updatedAt ||
    Number.isNaN(Date.parse(updatedAt))
  ) {
    // Said rather than silently restarted from the top: a puller handed a
    // cursor this route did not issue would otherwise re-read the whole
    // customer book and never find out why.
    throw new BadRequestException({
      code: 'invalid-cursor',
      message: 'That cursor was not issued by this endpoint',
    });
  }
  return { updatedAt, id };
}
