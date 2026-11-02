import { Injectable } from '@nestjs/common';
import {
  AccountErasureStep,
  ErasedAccount,
  Tx,
} from '../core/accounts/account-erasure';
import {
  ACCOUNT_DELETION_CATEGORIES,
  recordDestruction,
  REGISTRATION_CATEGORIES,
} from './record-destruction';

/** The record that an account's erasure happened (NFR-LEGAL-12). */
@Injectable()
export class AccountDestruction implements AccountErasureStep {
  async erase(tx: Tx, account: ErasedAccount): Promise<void> {
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
}
