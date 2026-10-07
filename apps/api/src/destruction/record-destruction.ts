import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  DestructionCategory,
  DestructionReason,
  DestructionSubject,
} from '@b2b-catalog-platform/shared';
import * as schema from '../db/schema';
import { destructionRecords } from '../db/schema';

type Writer = Pick<NodePgDatabase<typeof schema>, 'insert'>;

/** What deleting an account destroys (FR-AUTH-06, FR-ADM-23). */
export const ACCOUNT_DELETION_CATEGORIES: readonly DestructionCategory[] = [
  'account-details',
  'addresses',
  'order-details',
  'order-documents',
];

/** What removing an order's personal details destroys (NFR-LEGAL-14),
 * whether its retention ended or a guest asked. */
export const ORDER_REMOVAL_CATEGORIES: readonly DestructionCategory[] = [
  'order-details',
  'order-documents',
];

/** What declining a registration destroys (FR-AUTH-11): it never ordered. */
export const REGISTRATION_CATEGORIES: readonly DestructionCategory[] = [
  'account-details',
  'addresses',
];

export interface Destruction {
  readonly subject: DestructionSubject;
  readonly subjectId: string;
  readonly categories: readonly DestructionCategory[];
  readonly reason: DestructionReason;
  /** The holder (no address: it is what went), a staff member, or nobody
   * for the retention sweep. */
  readonly by: { readonly id: string; readonly email?: string } | null;
}

/**
 * Records a destruction of personal data (NFR-LEGAL-12), in the caller's
 * transaction: the record and the destruction happen together or not at all.
 * A plain function, as `withdrawAccountConsents` is, so the services that
 * destroy data need no module of their own to say so.
 */
export async function recordDestruction(
  db: Writer,
  destruction: Destruction,
): Promise<void> {
  await db.insert(destructionRecords).values({
    subject: destruction.subject,
    subjectId: destruction.subjectId,
    categories: [...destruction.categories],
    reason: destruction.reason,
    destroyedBy: destruction.by?.id ?? null,
    destroyedByEmail: destruction.by?.email ?? null,
  });
}
