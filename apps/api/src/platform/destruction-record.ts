import { Database } from './db/database';
import { destructionRecords } from './db/schema';
import {
  DestructionCategory,
  DestructionReason,
  DestructionSubject,
} from './destruction';

type Writer = Pick<Database, 'insert'>;

export interface Destruction {
  readonly subject: DestructionSubject;
  readonly subjectId: string;
  readonly categories: readonly DestructionCategory[];
  readonly reason: DestructionReason;
  /** The holder (without the address: it is what went), a staff member, or
   * nobody for the sweep. */
  readonly by: { readonly id: string; readonly email?: string } | null;
}

/** Records destructions of personal data (NFR-LEGAL-12) in the caller's
 * transaction, so the record and the act commit together. */
export async function recordDestruction(
  db: Writer,
  ...destructions: readonly Destruction[]
): Promise<void> {
  if (destructions.length === 0) return;
  await db.insert(destructionRecords).values(
    destructions.map((destruction) => ({
      subject: destruction.subject,
      subjectId: destruction.subjectId,
      categories: [...destruction.categories],
      reason: destruction.reason,
      destroyedBy: destruction.by?.id ?? null,
      destroyedByEmail: destruction.by?.email ?? null,
    })),
  );
}
