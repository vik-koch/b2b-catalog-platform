import { Module } from '@nestjs/common';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { CatalogSyncController } from './catalog-sync.controller';
import { CatalogSyncService } from './catalog-sync.service';
import { CustomerSyncController } from './customer-sync.controller';
import { CustomerReadService } from './customer-read.service';
import { OrderReadService } from './order-read.service';
import { MachineCustomerReadController } from './machine-customer-read.controller';
import { MachineCustomerSyncController } from './machine-customer-sync.controller';
import { MachineOrderReadController } from './machine-order-read.controller';
import { MachineSyncController } from './machine-sync.controller';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncNotifications } from './sync-notifications';
import { CustomerSyncService } from './customer-sync.service';
import { SyncRunLog } from './sync-run-log';
import { StaffUsersModule } from '../users/staff-users.module';
import { MailModule } from '../mail/mail.module';
import {
  LOW_STOCK_THRESHOLD_PIECES,
  loadLowStockThresholdPieces,
  MONEY_FORMAT,
  loadMoneyFormat,
  SYNC_POLICY,
  loadSyncPolicy,
  CUSTOMER_SYNC_POLICY,
  loadCustomerSyncPolicy,
} from '../config/deployment-config';
import { AccountInvitations } from '../users/account-invitations';

/**
 * The exchange, in all three of its areas: the bulk catalog sync (FR-ADM-02,
 * FR-ADM-07), the customer exchange (FR-ADM-11, FR-ADM-12) and the outbound
 * reads that go with them (FR-ADM-08, FR-ADM-18). DatabaseModule is @Global, so
 * DRIZZLE needs no import; AuthModule supplies the guards behind
 * `@Auth('admin')` and ApiTokensModule the one behind `@Machine(...)`.
 * MailModule is what an automated run tells the shop with (FR-ADM-09).
 */
@Module({
  imports: [
    AuthModule,
    ApiTokensModule,
    SettingsModule,
    MailModule,
    // The customer exchange writes accounts, and does it through the same
    // service and the same invitation mail a manager's approval goes through —
    // there is one way to create an account here, not two.
    StaffUsersModule,
  ],
  controllers: [
    SyncController,
    CatalogSyncController,
    CustomerSyncController,
    MachineSyncController,
    MachineCustomerSyncController,
    MachineCustomerReadController,
    MachineOrderReadController,
  ],
  providers: [
    SyncService,
    CatalogSyncService,
    AccountInvitations,
    CustomerSyncService,
    CustomerReadService,
    OrderReadService,
    SyncRunLog,
    SyncNotifications,
    {
      provide: LOW_STOCK_THRESHOLD_PIECES,
      useFactory: loadLowStockThresholdPieces,
    },
    { provide: SYNC_POLICY, useFactory: loadSyncPolicy },
    { provide: CUSTOMER_SYNC_POLICY, useFactory: loadCustomerSyncPolicy },
    // Only for the locale its dates are written in: a mail about a run states
    // when it ran, and the deployment writes one kind of timestamp.
    { provide: MONEY_FORMAT, useFactory: loadMoneyFormat },
  ],
})
export class SyncModule {}
