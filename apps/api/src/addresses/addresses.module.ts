import { Module } from '@nestjs/common';
import { AuditLogger } from '../audit/audit.logger';
import { env } from '../env';
import { AuthModule } from '../auth/auth.module';
import {
  ADDRESS_CONFIG,
  COMPANY_ID_RULE,
  loadAddressConfig,
  loadCompanyIdRule,
} from '../config/deployment-config';
import { AddressSuggestionController } from './address-suggestion.controller';
import {
  ADDRESS_SUGGESTION_PORT,
  createAddressSuggestionPort,
} from './address-suggestion.port';
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
  controllers: [AddressesController, AddressSuggestionController],
  providers: [
    AddressesService,
    AuditLogger,
    { provide: ADDRESS_CONFIG, useFactory: loadAddressConfig },
    // The same rule registration is checked against: one jurisdiction, one set
    // of accepted shapes, wherever a number is entered.
    { provide: COMPANY_ID_RULE, useFactory: loadCompanyIdRule },
    {
      // Resolved once at boot, from the environment alone: a sidecar to call,
      // or plain typing. Nothing about it reaches the browser.
      provide: ADDRESS_SUGGESTION_PORT,
      useFactory: () => createAddressSuggestionPort(env.SUGGESTION_SIDECAR_URL),
    },
  ],
  exports: [AddressesService],
})
export class AddressesModule {}
