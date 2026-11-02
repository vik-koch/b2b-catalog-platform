import { Module } from '@nestjs/common';
import { AuditLogger } from '../../audit/audit.logger';
import { AccountsCoreModule } from '../../core/accounts/accounts-core.module';
import { AccountController } from './account.controller';

/**
 * Self-service for the signed-in account. Kept apart from the staff's account
 * screens for the same reason the contracts are: one answers "who may manage
 * this person", the other only ever serves the session's own row.
 */
@Module({
  imports: [AccountsCoreModule],
  controllers: [AccountController],
  providers: [AuditLogger],
})
export class AccountModule {}
