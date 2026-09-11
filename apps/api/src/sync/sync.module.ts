import { Module } from '@nestjs/common';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { AuthModule } from '../auth/auth.module';
import { SettingsModule } from '../settings/settings.module';
import { MachineSyncController } from './machine-sync.controller';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import {
  LOW_STOCK_THRESHOLD_PIECES,
  loadLowStockThresholdPieces,
  SYNC_POLICY,
  loadSyncPolicy,
} from '../config/deployment-config';

/**
 * Bulk catalog sync (FR-ADM-02, FR-ADM-07). DatabaseModule is @Global, so
 * DRIZZLE needs no import; AuthModule supplies the guards behind
 * `@Auth('admin')` and ApiTokensModule the one behind `@Machine(...)`.
 */
@Module({
  imports: [AuthModule, ApiTokensModule, SettingsModule],
  controllers: [SyncController, MachineSyncController],
  providers: [
    SyncService,
    {
      provide: LOW_STOCK_THRESHOLD_PIECES,
      useFactory: loadLowStockThresholdPieces,
    },
    { provide: SYNC_POLICY, useFactory: loadSyncPolicy },
  ],
})
export class SyncModule {}
