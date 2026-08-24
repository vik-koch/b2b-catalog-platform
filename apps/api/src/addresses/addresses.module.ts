import { Module } from '@nestjs/common';
import { AuditLogger } from '../audit/audit.logger';
import { AuthModule } from '../auth/auth.module';
import {
  ADDRESS_CONFIG,
  COMPANY_ID_RULE,
  loadAddressConfig,
  loadCompanyIdRule,
} from '../config/deployment-config';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

/**
 * The address book and the suggestions that fill it in. One module for both
 * even though only the book is account-scoped: they are the same subject, and
 * the suggestion adapter is chosen from the same config slice the book
 * validates countries against.
 */
@Module({
  imports: [AuthModule],
  controllers: [AddressesController],
  providers: [
    AddressesService,
    AuditLogger,
    { provide: ADDRESS_CONFIG, useFactory: loadAddressConfig },
    // The same rule registration is checked against: one jurisdiction, one set
    // of accepted shapes, wherever a number is entered.
    { provide: COMPANY_ID_RULE, useFactory: loadCompanyIdRule },
  ],
  exports: [AddressesService],
})
export class AddressesModule {}
