import { Module } from '@nestjs/common';
import { AuditLogger } from '../../audit/audit.logger';
import { AccountsCoreModule } from '../../core/accounts/accounts-core.module';
import { OwnershipStateModule } from '../../settings/ownership-state.module';
import { ConsentAdminModule } from './consent-admin.module';
import { StaffUsersController } from './staff-users.controller';

/**
 * Account management (FR-AUTH-03/04): the screens a manager approves and
 * re-tiers customers from, and the invitations those decisions send.
 */
@Module({
  imports: [AccountsCoreModule, OwnershipStateModule, ConsentAdminModule],
  controllers: [StaffUsersController],
  providers: [AuditLogger],
})
export class StaffUsersModule {}
