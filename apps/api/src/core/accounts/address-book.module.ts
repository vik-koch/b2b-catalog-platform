import { Module } from '@nestjs/common';
import { ADDRESS_CONFIG, loadAddressConfig } from './accounts-config';
import { AddressesService } from './addresses.service';

/** The address book without its routes, for registration and checkout. */
@Module({
  providers: [
    AddressesService,
    { provide: ADDRESS_CONFIG, useFactory: loadAddressConfig },
  ],
  exports: [AddressesService],
})
export class AddressBookModule {}
