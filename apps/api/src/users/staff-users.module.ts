import { Module } from '@nestjs/common';
import { AuditLogger } from '../audit/audit.logger';
import { AuthModule } from '../auth/auth.module';
import {
  COMPANY_ID_FORMATS,
  loadCompanyIdFormats,
} from '../config/deployment-config';
import { MailModule } from '../mail/mail.module';
import { AccountInvitations } from './account-invitations';
import { StaffUsersController } from './staff-users.controller';
import { StaffUsersService } from './staff-users.service';

/**
 * Account management (FR-AUTH-03/04): the screens a manager approves and
 * re-tiers customers from, and the invitations those decisions send.
 *
 * Separate from UsersModule on purpose — AuthModule depends on that one, and
 * this depends on AuthModule (for the guards and the password/token services),
 * so merging them would be a cycle.
 */
@Module({
  imports: [AuthModule, MailModule],
  controllers: [StaffUsersController],
  providers: [
    StaffUsersService,
    AccountInvitations,
    AuditLogger,
    // The shapes the list's "which kind of number" filter can name.
    { provide: COMPANY_ID_FORMATS, useFactory: loadCompanyIdFormats },
  ],
  exports: [StaffUsersService],
})
export class StaffUsersModule {}
