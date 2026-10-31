import { Module } from '@nestjs/common';
import { OwnershipState } from './ownership-state';

/** The reader on its own, for the catalog, order, customer and sync modules
 * that ask it before they accept a write. */
@Module({
  providers: [OwnershipState],
  exports: [OwnershipState],
})
export class OwnershipStateModule {}
