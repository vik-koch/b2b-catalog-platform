import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { AuthModule } from '../../auth/auth.module';
import { SearchLogger } from './search.logger';
import { CatalogCoreModule } from '../../core/catalog/catalog-core.module';
import {
  ALTERNATE_LAYOUT,
  loadAlternateLayout,
} from '../../config/deployment-config';

/**
 * The storefront's catalog read API (FR-CAT). Public, tier-priced where a
 * session says so; DatabaseModule is @Global, so DRIZZLE needs no import.
 */
@Module({
  imports: [AuthModule, CatalogCoreModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    SearchLogger,
    { provide: ALTERNATE_LAYOUT, useFactory: loadAlternateLayout },
  ],
})
export class CatalogModule {}
