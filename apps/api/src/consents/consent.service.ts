import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, inArray, or, SQL } from 'drizzle-orm';
import {
  CONSENT_PAGE_SLUGS,
  ConsentPurpose,
  ConsentRecord,
  ConsentRefusalCode,
  formatPersonName,
} from '@b2b-catalog-platform/shared';
import { CONSENT_PURPOSES_ASKED } from '../config/deployment-config';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { consents, pageVersions, users } from '../db/schema';
import { currentPageVersion } from '../pages/page-versions';

/** A consent that passed the check, ready to be recorded. */
export interface CheckedConsent {
  readonly purpose: ConsentPurpose;
  readonly pageVersionId: string;
}

/** Whose consent it is: an account, or the address or number an inquiry gave. */
export interface ConsentHolder {
  readonly userId?: string;
  readonly email?: string;
  readonly phone?: string;
}

/**
 * What a form's posted version amounts to, against the text's current one:
 * accepted, or the code it is refused with.
 */
export function judgeConsent(
  current: number | undefined,
  posted: number | undefined,
): 'ok' | ConsentRefusalCode {
  // Published but never written: the form had nothing to show, so it fails
  // closed rather than sending personal data without the consent it owes.
  if (current === undefined) return 'consent-unavailable';
  if (posted === undefined) return 'consent-required';
  return posted === current ? 'ok' : 'consent-stale';
}

const refusals = {
  'consent-required': () =>
    new BadRequestException({
      code: 'consent-required',
      message: 'This form needs its consent box ticked',
    }),
  'consent-stale': () =>
    new ConflictException({
      code: 'consent-stale',
      message: 'The consent text has changed since the form loaded it',
    }),
  'consent-unavailable': () =>
    new ServiceUnavailableException({
      code: 'consent-unavailable',
      message: 'The consent text for this form is not written yet',
    }),
} satisfies Record<ConsentRefusalCode, () => Error>;

/**
 * Consent to processing personal data (NFR-LEGAL-09): whether a form owes it,
 * and the record that it was given.
 */
@Injectable()
export class ConsentService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(CONSENT_PURPOSES_ASKED)
    private readonly asked: readonly ConsentPurpose[],
  ) {}

  isAsked(purpose: ConsentPurpose): boolean {
    return this.asked.includes(purpose);
  }

  /**
   * Checks the version a form posted. Null when the purpose is not asked,
   * whatever was posted; otherwise the consent to record, or a refusal.
   */
  async check(
    purpose: ConsentPurpose,
    posted: number | undefined,
  ): Promise<CheckedConsent | null> {
    if (!this.isAsked(purpose)) return null;
    const current = await currentPageVersion(
      this.db,
      CONSENT_PAGE_SLUGS[purpose],
    );
    const verdict = judgeConsent(current?.version, posted);
    if (verdict !== 'ok') throw refusals[verdict]();
    // Never taken: `ok` is only said of a text that exists. It narrows the type.
    if (!current) throw refusals['consent-unavailable']();
    return { purpose, pageVersionId: current.id };
  }

  /** Takes a transaction where the record must stand or fall with a write. */
  async record(
    consent: CheckedConsent,
    holder: ConsentHolder,
    db: Pick<NodePgDatabase<typeof schema>, 'insert'> = this.db,
  ): Promise<void> {
    await db.insert(consents).values({
      purpose: consent.purpose,
      pageVersionId: consent.pageVersionId,
      userId: holder.userId ?? null,
      email: holder.email?.trim().toLowerCase() || null,
      phone: holder.phone || null,
    });
  }

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
      })
      .from(consents)
      .innerJoin(pageVersions, eq(pageVersions.id, consents.pageVersionId))
      .leftJoin(users, eq(users.id, consents.userId))
      .where(condition)
      .orderBy(desc(consents.createdAt));
    return rows.map(({ record, version, label, account }) => ({
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
    }));
  }

  /** Whether the account has given this consent before. */
  async hasGiven(userId: string, purpose: ConsentPurpose): Promise<boolean> {
    const [row] = await this.db
      .select({ id: consents.id })
      .from(consents)
      .where(and(eq(consents.userId, userId), eq(consents.purpose, purpose)))
      .limit(1);
    return row !== undefined;
  }
}
