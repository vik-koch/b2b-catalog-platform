import { Module } from '@nestjs/common';
import { AuditLogger } from '../../audit/audit.logger';
import { ExchangeCoreModule } from '../../core/exchange/exchange-core.module';
import { SessionModule } from '../../platform/auth/session.module';
import { ApiTokensController } from './api-tokens.controller';
import { ApiTokensService } from './api-tokens.service';
import { CatalogSyncController } from './catalog-sync.controller';
import { CustomerSyncController } from './customer-sync.controller';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

/** The staff's side of the exchange: uploads, the run log, machine tokens. */
@Module({
  imports: [SessionModule, ExchangeCoreModule],
  controllers: [
    SyncController,
    CatalogSyncController,
    CustomerSyncController,
    ApiTokensController,
  ],
  providers: [SyncService, ApiTokensService, AuditLogger],
})
export class AdminExchangeModule {}
