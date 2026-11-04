import { Module } from '@nestjs/common';
import {
  COMPANY_ID_RULE,
  loadCompanyIdRule,
} from '../../platform/config/deployment-config';
import { MailModule } from '../../platform/mail/mail.module';
import { AccountsCoreModule } from '../../core/accounts/accounts-core.module';
import { AddressBookModule } from '../../core/accounts/address-book.module';
import { ConsentModule } from '../../core/site/consent.module';
import { MaintenanceStateModule } from '../../core/site/maintenance-state.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordSetupService } from './password-setup.service';
import { RegistrationService } from './registration.service';

/** Sign-in, registration and the password links a visitor follows. */
@Module({
  imports: [
    AccountsCoreModule,
    MailModule,
    AddressBookModule,
    MaintenanceStateModule,
    ConsentModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistrationService,
    PasswordSetupService,
    // Compiled at boot: a bad pattern fails the start, not each registration.
    { provide: COMPANY_ID_RULE, useFactory: loadCompanyIdRule },
  ],
})
export class AuthModule {}
