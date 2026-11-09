import { Module } from '@nestjs/common';

import { CatalogCoreModule } from '../../core/catalog/catalog-core.module';
import { SessionModule } from '../../platform/auth/session.module';
import {
  ALTERNATE_LAYOUT,
  loadAlternateLayout,
} from '../../platform/config/deployment-config';
import { CatalogSearchService } from './catalog-search.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { SearchController } from './search.controller';
import { SearchLogger } from './search.logger';

/** The storefront's catalog read API (FR-CAT, FR-SEARCH). DatabaseModule is
 * global, so DRIZZLE needs no import. */
@Module({
  imports: [SessionModule, CatalogCoreModule],
  controllers: [CatalogController, SearchController],
  providers: [
    CatalogService,
    CatalogSearchService,
    SearchLogger,
    { provide: ALTERNATE_LAYOUT, useFactory: loadAlternateLayout },
  ],
})
export class CatalogModule {}
