import { Module } from '@nestjs/common';
import { ADDRESS_CONFIG, loadAddressConfig } from '../config/deployment-config';
import { AddressesService } from './addresses.service';

/**
 * The address book itself, without the HTTP around it. Split from
 * `AddressesModule` so that registration can seed an account's first address
 * (FR-AUTH-10) without importing the controllers — those need `AuthModule` for
 * their guards, and `AuthModule` needing them back would be a cycle.
 */
@Module({
  providers: [
    AddressesService,
    { provide: ADDRESS_CONFIG, useFactory: loadAddressConfig },
    // The same rule registration is checked against: one jurisdiction, one set
    // of accepted shapes, wherever a number is entered.
  ],
  exports: [AddressesService],
})
export class AddressBookModule {}
