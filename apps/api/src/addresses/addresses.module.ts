import { Module } from '@nestjs/common';
import { AuditLogger } from '../audit/audit.logger';
import { AddressBookModule } from './address-book.module';
import { env } from '../env';
import { AuthModule } from '../auth/auth.module';
import { AddressSuggestionController } from './address-suggestion.controller';
import {
  ADDRESS_SUGGESTION_PORT,
  createAddressSuggestionPort,
} from './address-suggestion.port';
import { AddressesController } from './addresses.controller';

/**
 * The address book and the suggestions that fill it in. One module for both
 * even though only the book is account-scoped: they are the same subject, and
 * the suggestion adapter is chosen from the same config slice the book
 * validates countries against.
 */
@Module({
  imports: [AuthModule, AddressBookModule],
  controllers: [AddressesController, AddressSuggestionController],
  providers: [
    AuditLogger,
    {
      // Resolved once at boot, from the environment alone: a sidecar to call,
      // or plain typing. Nothing about it reaches the browser.
      provide: ADDRESS_SUGGESTION_PORT,
      useFactory: () => createAddressSuggestionPort(env.SUGGESTION_SIDECAR_URL),
    },
  ],
  exports: [AddressBookModule],
})
export class AddressesModule {}
