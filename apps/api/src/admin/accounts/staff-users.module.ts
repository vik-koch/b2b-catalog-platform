import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import { AuditLogger } from '../audit/audit.logger';
import { AuthModule } from '../auth/auth.module';
import {
  ACCEPTED_CUSTOMER_TYPES,
  ALTERNATE_LAYOUT,
  COMPANY_ID_FORMATS,
  loadAcceptedCustomerTypes,
  loadAlternateLayout,
  loadCompanyIdFormats,
} from '../config/deployment-config';
import { ConsentModule } from '../consents/consent.module';
import { MailModule } from '../mail/mail.module';
import { OwnershipStateModule } from '../settings/ownership-state.module';
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
  imports: [
    AuthModule,
    MailModule,
    OwnershipStateModule,
    ConsentModule,
    AccountModule,
  ],
  controllers: [StaffUsersController],
  providers: [
    StaffUsersService,
    AccountInvitations,
    AuditLogger,
    // The shapes the list's "which kind of number" filter can name.
    { provide: COMPANY_ID_FORMATS, useFactory: loadCompanyIdFormats },
    { provide: ALTERNATE_LAYOUT, useFactory: loadAlternateLayout },
    {
      provide: ACCEPTED_CUSTOMER_TYPES,
      useFactory: loadAcceptedCustomerTypes,
    },
  ],
  exports: [StaffUsersService],
})
export class StaffUsersModule {}
