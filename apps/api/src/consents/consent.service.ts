import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq } from 'drizzle-orm';
import {
  CONSENT_PAGE_SLUGS,
  ConsentPurpose,
  ConsentRefusalCode,
} from '@b2b-catalog-platform/shared';
import { CONSENT_PURPOSES_ASKED } from '../config/deployment-config';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { consents, pageVersions } from '../db/schema';

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
    const [current] = await this.db
      .select({ id: pageVersions.id, version: pageVersions.version })
      .from(pageVersions)
      .where(eq(pageVersions.slug, CONSENT_PAGE_SLUGS[purpose]))
      .orderBy(desc(pageVersions.version))
      .limit(1);
    const verdict = judgeConsent(current?.version, posted);
    if (verdict !== 'ok') throw refusals[verdict]();
    return { purpose, pageVersionId: current.id };
  }

  async record(consent: CheckedConsent, holder: ConsentHolder): Promise<void> {
    await this.db.insert(consents).values({
      purpose: consent.purpose,
      pageVersionId: consent.pageVersionId,
      userId: holder.userId ?? null,
      email: holder.email?.trim().toLowerCase() || null,
      phone: holder.phone || null,
    });
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
