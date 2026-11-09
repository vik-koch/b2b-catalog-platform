import { Module } from '@nestjs/common';

import { OwnershipState } from './ownership-state';

/** The reader on its own, for every module that asks before a write. */
@Module({
  providers: [OwnershipState],
  exports: [OwnershipState],
})
export class OwnershipStateModule {}
