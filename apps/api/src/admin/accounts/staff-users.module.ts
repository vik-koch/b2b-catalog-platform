import { Module } from '@nestjs/common';

import { AccountsCoreModule } from '../../core/accounts/accounts-core.module';
import { AuditLogger } from '../../platform/audit/audit.logger';
import { OwnershipStateModule } from '../../platform/settings/ownership-state.module';
import { ConsentAdminModule } from './consent-admin.module';
import { StaffUsersController } from './staff-users.controller';

/** Account management (FR-AUTH-03/04). */
@Module({
  imports: [AccountsCoreModule, OwnershipStateModule, ConsentAdminModule],
  controllers: [StaffUsersController],
  providers: [AuditLogger],
})
export class StaffUsersModule {}
