import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { desc, eq, inArray, or, SQL } from 'drizzle-orm';
import { AnyPgColumn } from 'drizzle-orm/pg-core';

import { ConsentRecord } from '@b2b-catalog-platform/shared/admin/accounts';
import { formatPersonName } from '@b2b-catalog-platform/shared/core/accounts';
import {
  ConsentPurpose,
  ConsentWithdrawalReason,
} from '@b2b-catalog-platform/shared/core/site';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

import { users } from '../../core/accounts/accounts-schema';
import {
  consents,
  consentWithdrawals,
  pageVersions,
} from '../../core/site/site-schema';
import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';

/** Consent records as staff read them (NFR-LEGAL-09), with their accounts. */
@Injectable()
export class ConsentRecords {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * The records naming this address or number, newest first, and those of
   * the account holding it now: a record keeps what it was given with, and
   * the person may have changed it since.
   */
  async findByHolder(holder: {
    email?: string;
    phone?: string;
  }): Promise<ConsentRecord[]> {
    const email = holder.email?.trim().toLowerCase();
    const phone = holder.phone?.trim();
    const naming = (
      recorded: AnyPgColumn,
      stored: AnyPgColumn,
      value: string,
    ) =>
      or(
        eq(recorded, value),
        inArray(
          consents.userId,
          this.db.select({ id: users.id }).from(users).where(eq(stored, value)),
        ),
      );
    if (email)
      return this.findWhere(naming(consents.email, users.email, email));
    if (phone)
      return this.findWhere(naming(consents.phone, users.phone, phone));
    // Neither: nothing, not every record there is.
    return [];
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
   * A withdrawal that reached the shop by letter, mail or call. Only a
   * contact consent: the account consent ends with the account. A second
   * entry is refused, never written over the first.
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
