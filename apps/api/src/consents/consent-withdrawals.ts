import { and, eq, isNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ConsentWithdrawalReason } from '@b2b-catalog-platform/shared';
import * as schema from '../db/schema';
import { consents, consentWithdrawals } from '../db/schema';

type Writer = Pick<NodePgDatabase<typeof schema>, 'select' | 'insert'>;

/**
 * Ends every consent an account still holds (NFR-LEGAL-09), in the caller's
 * transaction: the account consent ends with the account, so it is written in
 * the same moment the account is deleted or its registration removed. A plain
 * function rather than a service method, so the account's own services can
 * call it without depending on the consent module.
 *
 * `by` is the admin who deleted the account on the person's request
 * (FR-ADM-23): the reason stays the deletion, and the record says who did it.
 */
export async function withdrawAccountConsents(
  db: Writer,
  userId: string,
  reason: Exclude<ConsentWithdrawalReason, 'entered'>,
  by?: { readonly id: string; readonly email: string },
): Promise<void> {
  const open = await db
    .select({ id: consents.id })
    .from(consents)
    .leftJoin(consentWithdrawals, eq(consentWithdrawals.consentId, consents.id))
    .where(and(eq(consents.userId, userId), isNull(consentWithdrawals.id)));
  if (open.length === 0) return;
  await db.insert(consentWithdrawals).values(
    open.map((consent) => ({
      consentId: consent.id,
      reason,
      enteredBy: by?.id ?? null,
      enteredByEmail: by?.email ?? null,
    })),
  );
}
