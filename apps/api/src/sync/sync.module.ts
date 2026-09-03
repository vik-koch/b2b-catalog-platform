import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import {
  LOW_STOCK_THRESHOLD_PIECES,
  loadLowStockThresholdPieces,
} from '../config/deployment-config';

/**
 * Bulk catalog sync (FR-ADM-02). DatabaseModule is @Global, so DRIZZLE needs no
 * import; AuthModule supplies the guards behind `@Auth('admin')`.
 */
@Module({
  imports: [AuthModule],
  controllers: [SyncController],
  providers: [
    SyncService,
    {
      provide: LOW_STOCK_THRESHOLD_PIECES,
      useFactory: loadLowStockThresholdPieces,
    },
  ],
})
export class SyncModule {}
