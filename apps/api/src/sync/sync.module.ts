import { Module } from '@nestjs/common';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { MachineSyncController } from './machine-sync.controller';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncNotifications } from './sync-notifications';
import { MailModule } from '../mail/mail.module';
import {
  LOW_STOCK_THRESHOLD_PIECES,
  loadLowStockThresholdPieces,
  MONEY_FORMAT,
  loadMoneyFormat,
  SYNC_POLICY,
  loadSyncPolicy,
} from '../config/deployment-config';

/**
 * Bulk catalog sync (FR-ADM-02, FR-ADM-07). DatabaseModule is @Global, so
 * DRIZZLE needs no import; AuthModule supplies the guards behind
 * `@Auth('admin')` and ApiTokensModule the one behind `@Machine(...)`.
 * MailModule is what an automated run tells the shop with (FR-ADM-09).
 */
@Module({
  imports: [AuthModule, ApiTokensModule, SettingsModule, MailModule],
  controllers: [SyncController, MachineSyncController],
  providers: [
    SyncService,
    SyncNotifications,
    {
      provide: LOW_STOCK_THRESHOLD_PIECES,
      useFactory: loadLowStockThresholdPieces,
    },
    { provide: SYNC_POLICY, useFactory: loadSyncPolicy },
    // Only for the locale its dates are written in: a mail about a run states
    // when it ran, and the deployment writes one kind of timestamp.
    { provide: MONEY_FORMAT, useFactory: loadMoneyFormat },
  ],
})
export class SyncModule {}
