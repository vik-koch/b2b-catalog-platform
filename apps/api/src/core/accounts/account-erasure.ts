import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AccountDeletionReason } from '@b2b-catalog-platform/shared/core/accounts';
import * as schema from '../../platform/db/schema';
import {
  ACCOUNT_DELETION_CATEGORIES,
  recordDestruction,
  REGISTRATION_CATEGORIES,
} from '../../platform/destruction-record';

/** The transaction handle Drizzle hands a `db.transaction` callback. */
export type Tx = Parameters<
  Parameters<NodePgDatabase<typeof schema>['transaction']>[0]
>[0];

/** An account on its way out, as the steps that erase it are told. */
export interface ErasedAccount {
  readonly userId: string;
  /** An account anonymized, or a pending registration removed outright. */
  readonly kind: 'account' | 'registration';
  readonly reason: AccountDeletionReason | 'registration-declined';
  /** The holder, or the staff member who did it. */
  readonly by: { readonly id: string; readonly email?: string };
}

/** What another area does when an account is erased: its own data about it. */
export interface AccountErasureStep {
  /** In the erasure's transaction: the account and this go together. */
  erase(tx: Tx, account: ErasedAccount): Promise<void>;
  /** After the commit, for what a transaction cannot roll back: files. */
  afterCommit?(account: ErasedAccount): Promise<void>;
}

/** The steps, in order. The app root lists them. */
export const ACCOUNT_ERASURE_STEPS = 'ACCOUNT_ERASURE_STEPS';

/**
 * Erasing an account reaches data other areas own (orders). Accounts may not
 * import them, so they hand in their steps instead. The record that it
 * happened (NFR-LEGAL-12) comes last, once the steps have destroyed what it
 * names.
 */
@Injectable()
export class AccountErasure {
  constructor(
    @Inject(ACCOUNT_ERASURE_STEPS)
    private readonly steps: readonly AccountErasureStep[],
  ) {}

  async erase(tx: Tx, account: ErasedAccount): Promise<void> {
    for (const step of this.steps) await step.erase(tx, account);
    await recordDestruction(tx, {
      subject: 'account',
      subjectId: account.userId,
      categories:
        account.kind === 'account'
          ? ACCOUNT_DELETION_CATEGORIES
          : REGISTRATION_CATEGORIES,
      reason: account.reason,
      by: account.by,
    });
  }

  async afterCommit(account: ErasedAccount): Promise<void> {
    for (const step of this.steps) await step.afterCommit?.(account);
  }
}
