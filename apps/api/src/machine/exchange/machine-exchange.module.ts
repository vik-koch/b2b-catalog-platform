import { Module } from '@nestjs/common';
import { ExchangeCoreModule } from '../../core/exchange/exchange-core.module';
import { MachineAuthModule } from '../../platform/auth/machine-auth.module';
import { CustomerReadService } from './customer-read.service';
import { MachineCustomerReadController } from './machine-customer-read.controller';
import { MachineCustomerSyncController } from './machine-customer-sync.controller';
import { MachineOrderReadController } from './machine-order-read.controller';
import { MachineOrderSyncController } from './machine-order-sync.controller';
import { MachineSyncController } from './machine-sync.controller';
import { MachineController } from './machine.controller';
import { OrderReadService } from './order-read.service';
import { OrderSyncService } from './order-sync.service';
import { OrderWriteBack } from './order-write-back';

/** The back office's side of the exchange (FR-ADM-08, FR-ADM-18). */
@Module({
  imports: [MachineAuthModule, ExchangeCoreModule],
  controllers: [
    MachineController,
    MachineSyncController,
    MachineCustomerSyncController,
    MachineCustomerReadController,
    MachineOrderReadController,
    MachineOrderSyncController,
  ],
  providers: [
    CustomerReadService,
    OrderReadService,
    OrderSyncService,
    OrderWriteBack,
  ],
})
export class MachineExchangeModule {}
