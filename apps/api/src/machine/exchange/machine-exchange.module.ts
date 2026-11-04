import { Module } from '@nestjs/common';
import { ExchangeCoreModule } from '../../core/exchange/exchange-core.module';
import { OrderingCoreModule } from '../../core/ordering/ordering-core.module';
import { MachineAuthModule } from '../../platform/auth/machine-auth.module';
import { OwnershipStateModule } from '../../platform/settings/ownership-state.module';
import { CustomerReadService } from './customer-read.service';
import { MachineCatalogSyncController } from './machine-catalog-sync.controller';
import { MachineCustomerReadController } from './machine-customer-read.controller';
import { MachineCustomerSyncController } from './machine-customer-sync.controller';
import { MachineIdentityController } from './machine-identity.controller';
import { MachineOrderDocumentsController } from './machine-order-documents.controller';
import { MachineOrderReadController } from './machine-order-read.controller';
import { MachineOrderSyncController } from './machine-order-sync.controller';
import { OrderReadService } from './order-read.service';
import { OrderSyncService } from './order-sync.service';
import { OrderWriteBack } from './order-write-back';

/** The back office's side of the exchange (FR-ADM-08, FR-ADM-18). */
@Module({
  imports: [
    MachineAuthModule,
    ExchangeCoreModule,
    // The write-back answers orders through the admin screens' own writer.
    OrderingCoreModule,
    OwnershipStateModule,
  ],
  controllers: [
    MachineIdentityController,
    MachineCatalogSyncController,
    MachineCustomerSyncController,
    MachineCustomerReadController,
    MachineOrderReadController,
    MachineOrderSyncController,
    MachineOrderDocumentsController,
  ],
  providers: [
    CustomerReadService,
    OrderReadService,
    OrderSyncService,
    OrderWriteBack,
  ],
})
export class MachineExchangeModule {}
