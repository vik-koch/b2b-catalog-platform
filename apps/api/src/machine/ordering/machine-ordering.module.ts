import { Module } from '@nestjs/common';
import { MachineAuthModule } from '../../platform/auth/machine-auth.module';
import { OrderingCoreModule } from '../../core/ordering/ordering-core.module';
import { OwnershipStateModule } from '../../core/site/ownership-state.module';
import { MachineOrderDocumentsController } from './machine-order-documents.controller';

/** The documents an owning system files against an order (FR-ADM-08). */
@Module({
  imports: [
    // The guard the machine document route is checked by (NFR-SEC-09).
    MachineAuthModule,
    OrderingCoreModule,
    OwnershipStateModule,
  ],
  controllers: [MachineOrderDocumentsController],
})
export class MachineOrderingModule {}
