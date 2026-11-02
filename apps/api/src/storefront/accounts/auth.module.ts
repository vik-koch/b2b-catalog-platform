import { Module } from '@nestjs/common';
import {
  COMPANY_ID_RULE,
  loadCompanyIdRule,
} from '../../config/deployment-config';
import { MailModule } from '../../mail/mail.module';
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
    // Registration seeds the account's first address from the company the
    // registrant picked (FR-AUTH-10).
    AddressBookModule,
    // Whether the shop is closed, which a customer's sign-in is refused on.
    MaintenanceStateModule,
    // The account consent, asked on registration or the first password.
    ConsentModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RegistrationService,
    PasswordSetupService,
    // The deployment's company-number format, compiled once at boot: a bad
    // pattern fails the startup rather than every registration.
    { provide: COMPANY_ID_RULE, useFactory: loadCompanyIdRule },
  ],
})
export class AuthModule {}
