import { Module } from '@nestjs/common';
import { AccountsCoreModule } from '../accounts/accounts-core.module';
import { OwnershipStateModule } from '../../platform/settings/ownership-state.module';
import { MailModule } from '../../platform/mail/mail.module';
import {
  ACCEPTED_CUSTOMER_TYPES,
  CUSTOMER_SYNC_POLICY,
  SYNC_POLICY,
  loadAcceptedCustomerTypes,
  loadCustomerSyncPolicy,
  loadSyncPolicy,
} from '../../platform/config/deployment-config';
import {
  LOW_STOCK_THRESHOLD_PIECES,
  loadLowStockThresholdPieces,
} from '../catalog/catalog-config';
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
  ],
})
export class ExchangeCoreModule {}
