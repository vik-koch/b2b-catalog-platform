import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ConsentWithdrawalReason } from '@b2b-catalog-platform/shared';
import * as schema from '../db/schema';

type Writer = Pick<NodePgDatabase<typeof schema>, 'execute'>;

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
  await db.execute(sql`
    INSERT INTO consent_withdrawals ("consentId", reason, "enteredBy", "enteredByEmail")
    SELECT c.id, ${reason}, ${by?.id ?? null}::uuid, ${by?.email ?? null}
      FROM consents c
     WHERE c."userId" = ${userId}
       AND NOT EXISTS (
         SELECT 1 FROM consent_withdrawals w WHERE w."consentId" = c.id)`);
}
