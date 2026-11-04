import { Module } from '@nestjs/common';
import {
  ADDRESS_CONFIG,
  loadAddressConfig,
} from '../../platform/config/deployment-config';
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
