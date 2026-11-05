import { Module } from '@nestjs/common';
import { AuditLogger } from '../../platform/audit/audit.logger';
import { AddressBookModule } from '../../core/accounts/address-book.module';
import { env } from '../../platform/env';
import { SessionModule } from '../../platform/auth/session.module';
import { AddressSuggestionController } from './address-suggestion.controller';
import { ADDRESS_SUGGESTION_PORT } from './address-suggestion.port';
import { createAddressSuggestionPort } from './http-address-suggestions';
import { AddressesController } from './addresses.controller';

/** The address book and the suggestions that fill it in. */
@Module({
  imports: [SessionModule, AddressBookModule],
  controllers: [AddressesController, AddressSuggestionController],
  providers: [
    AuditLogger,
    {
      provide: ADDRESS_SUGGESTION_PORT,
      useFactory: () => createAddressSuggestionPort(env.SUGGESTION_SIDECAR_URL),
    },
  ],
  exports: [AddressBookModule],
})
export class AddressesModule {}
