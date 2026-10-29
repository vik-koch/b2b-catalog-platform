import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { AuthModule } from '../../auth/auth.module';
import { SearchLogger } from './search.logger';
import {
  ALTERNATE_LAYOUT,
  loadAlternateLayout,
  loadTaxConfig,
  TAX_CONFIG,
} from '../../config/deployment-config';

/**
 * The storefront's catalog read API (FR-CAT). Public, tier-priced where a
 * session says so; DatabaseModule is @Global, so DRIZZLE needs no import.
 */
@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    SearchLogger,
    { provide: ALTERNATE_LAYOUT, useFactory: loadAlternateLayout },
    { provide: TAX_CONFIG, useFactory: loadTaxConfig },
  ],
  // The admin's product page reads through this service until that read moves to core.
  exports: [CatalogService],
})
export class CatalogModule {}
