import { Module } from '@nestjs/common';
import { ApiTokensModule } from '../../api-tokens/api-tokens.module';
import { OrderingCoreModule } from '../../core/ordering/ordering-core.module';
import { OwnershipStateModule } from '../../settings/ownership-state.module';
import { MachineOrderDocumentsController } from './machine-order-documents.controller';

/** The documents an owning system files against an order (FR-ADM-08). */
@Module({
  imports: [
    // The guard the machine document route is checked by (NFR-SEC-09).
    ApiTokensModule,
    OrderingCoreModule,
    OwnershipStateModule,
  ],
  controllers: [MachineOrderDocumentsController],
})
export class MachineOrderingModule {}
