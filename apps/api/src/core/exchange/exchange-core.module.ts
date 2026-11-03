import { Module } from '@nestjs/common';
import { AccountsCoreModule } from '../accounts/accounts-core.module';
import { OrderingCoreModule } from '../ordering/ordering-core.module';
import { OwnershipStateModule } from '../site/ownership-state.module';
import { MailModule } from '../../mail/mail.module';
import {
  ACCEPTED_CUSTOMER_TYPES,
  CUSTOMER_SYNC_POLICY,
  LOW_STOCK_THRESHOLD_PIECES,
  SYNC_POLICY,
  loadAcceptedCustomerTypes,
  loadCustomerSyncPolicy,
  loadLowStockThresholdPieces,
  loadSyncPolicy,
} from '../../config/deployment-config';
import { CatalogSyncService } from './catalog-sync.service';
import { CustomerSyncService } from './customer-sync.service';
import { SyncNotifications } from './sync-notifications';
import { SyncRunLog } from './sync-run-log';

/**
 * The engines an upload and a machine run share (FR-ADM-02, FR-ADM-07,
 * FR-ADM-11, FR-ADM-12), and the run log and mail behind them (FR-ADM-09).
 */
@Module({
  imports: [
    // The customer exchange creates accounts through the same service and
    // invitation mail a manager's approval goes through: one way, not two.
    AccountsCoreModule,
    // The order write-back answers orders through the same writer the admin
    // screens use, for the same reason.
    OrderingCoreModule,
    OwnershipStateModule,
    MailModule,
  ],
  providers: [
    CatalogSyncService,
    CustomerSyncService,
    SyncRunLog,
    SyncNotifications,
    {
      provide: LOW_STOCK_THRESHOLD_PIECES,
      useFactory: loadLowStockThresholdPieces,
    },
    { provide: SYNC_POLICY, useFactory: loadSyncPolicy },
    { provide: CUSTOMER_SYNC_POLICY, useFactory: loadCustomerSyncPolicy },
    {
      provide: ACCEPTED_CUSTOMER_TYPES,
      useFactory: loadAcceptedCustomerTypes,
    },
  ],
  exports: [
    CatalogSyncService,
    CustomerSyncService,
    SyncRunLog,
    SyncNotifications,
    OrderingCoreModule,
    OwnershipStateModule,
  ],
})
export class ExchangeCoreModule {}
