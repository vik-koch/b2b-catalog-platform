import { Module } from '@nestjs/common';

import { AccountsCoreModule } from '../../core/accounts/accounts-core.module';
import { AuditLogger } from '../../platform/audit/audit.logger';
import { AccountController } from './account.controller';

/** Self-service for the signed-in account. */
@Module({
  imports: [AccountsCoreModule],
  controllers: [AccountController],
  providers: [AuditLogger],
})
export class AccountModule {}
