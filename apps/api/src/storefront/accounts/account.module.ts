import { Module } from '@nestjs/common';
import { AuditLogger } from '../../audit/audit.logger';
import { AccountsCoreModule } from '../../core/accounts/accounts-core.module';
import { AccountController } from './account.controller';

/** Self-service for the signed-in account. */
@Module({
  imports: [AccountsCoreModule],
  controllers: [AccountController],
  providers: [AuditLogger],
})
export class AccountModule {}
