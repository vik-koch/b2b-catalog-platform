import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { desc, eq, inArray, or, SQL } from 'drizzle-orm';
import {
  ConsentPurpose,
  ConsentWithdrawalReason,
} from '@b2b-catalog-platform/shared/core/site';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import {
  consents,
  consentWithdrawals,
  pageVersions,
  users,
} from '../../db/schema';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';
import { formatPersonName } from '@b2b-catalog-platform/shared/core/accounts';
import { ConsentRecord } from '@b2b-catalog-platform/shared/admin/accounts';

/**
 * The consent records as staff read them (NFR-LEGAL-09), with the account
 * each names, and the withdrawals staff enter.
 */
@Injectable()
export class ConsentRecords {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * The records naming this address or number, newest first. An address also
   * finds the records of the account that holds it now, and a number those of
   * the account it is stored on: a record keeps the address it was given
   * with, and the person asking may have changed theirs since.
   */
  async findByHolder(holder: {
    email?: string;
    phone?: string;
  }): Promise<ConsentRecord[]> {
    const email = holder.email?.trim().toLowerCase();
    const phone = holder.phone?.trim();
    const condition = email
      ? or(
          eq(consents.email, email),
          inArray(
            consents.userId,
            this.db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, email)),
          ),
        )
      : phone
        ? or(
            eq(consents.phone, phone),
            inArray(
              consents.userId,
              this.db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.phone, phone)),
            ),
          )
        : undefined;
    // The query schema asks for exactly one; nothing is the honest answer to
    // neither, not every record there is.
    return condition ? this.findWhere(condition) : [];
  }

  /** An account's records, newest first. */
  findByAccount(userId: string): Promise<ConsentRecord[]> {
    return this.findWhere(eq(consents.userId, userId));
  }

  private async findWhere(
    condition: SQL | undefined,
  ): Promise<ConsentRecord[]> {
    const rows = await this.db
      .select({
        record: consents,
        version: pageVersions.version,
        label: pageVersions.consentLabel,
        account: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          status: users.status,
        },
        withdrawal: {
          at: consentWithdrawals.withdrawnAt,
          reason: consentWithdrawals.reason,
          enteredBy: consentWithdrawals.enteredByEmail,
          note: consentWithdrawals.note,
        },
      })
      .from(consents)
      .innerJoin(pageVersions, eq(pageVersions.id, consents.pageVersionId))
      .leftJoin(users, eq(users.id, consents.userId))
      .leftJoin(
        consentWithdrawals,
        eq(consentWithdrawals.consentId, consents.id),
      )
      .where(condition)
      .orderBy(desc(consents.createdAt));
    return rows.map(({ record, version, label, account, withdrawal }) => ({
      id: record.id,
      purpose: record.purpose as ConsentPurpose,
      givenAt: record.createdAt.toISOString(),
      version,
      label,
      email: record.email,
      phone: record.phone,
      account: account && {
        id: account.id,
        name: formatPersonName(account.firstName, account.lastName) || null,
        status: account.status,
      },
      withdrawal: withdrawal && {
        at: withdrawal.at.toISOString(),
        reason: withdrawal.reason as ConsentWithdrawalReason,
        enteredBy: withdrawal.enteredBy,
        note: withdrawal.note,
      },
    }));
  }

  /**
   * Enters a withdrawal that reached the shop from outside: a letter, a mail,
   * a call. Only a contact consent: the account consent is withdrawn by
   * deleting the account, which writes its own. A record ends once, so a
   * second entry is refused rather than written over the first.
   */
  async enterWithdrawal(
    id: string,
    admin: AuthUser,
    note: string | undefined,
  ): Promise<ConsentRecord> {
    const [record] = await this.db
      .select({ purpose: consents.purpose })
      .from(consents)
      .where(eq(consents.id, id));
    if (!record) {
      throw new NotFoundException({
        code: 'consent-not-found',
        message: 'No consent record with this id',
      });
    }
    if (record.purpose === 'account') {
      throw new ConflictException({
        code: 'consent-ends-with-account',
        message: 'An account consent is withdrawn by deleting the account',
      });
    }
    // The unique key settles a race with a second entry; nothing is updated.
    const written = await this.db
      .insert(consentWithdrawals)
      .values({
        consentId: id,
        reason: 'entered',
        enteredBy: admin.id,
        enteredByEmail: admin.email,
        note: note ?? null,
      })
      .onConflictDoNothing({ target: consentWithdrawals.consentId })
      .returning({ id: consentWithdrawals.id });
    if (!written.length) {
      throw new ConflictException({
        code: 'consent-already-withdrawn',
        message: 'This consent has already been withdrawn',
      });
    }
    const [updated] = await this.findWhere(eq(consents.id, id));
    return updated;
  }
}
