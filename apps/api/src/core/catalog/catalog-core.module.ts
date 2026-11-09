import { Module } from '@nestjs/common';

import {
  loadShopTimeZone,
  SHOP_TIME_ZONE,
} from '../../platform/config/deployment-config';
import { loadTaxConfig, TAX_CONFIG } from './catalog-config';
import { CatalogReader } from './catalog-reader';

/** What both audiences' catalog modules read through. */
@Module({
  providers: [
    CatalogReader,
    { provide: TAX_CONFIG, useFactory: loadTaxConfig },
    { provide: SHOP_TIME_ZONE, useFactory: loadShopTimeZone },
  ],
  exports: [CatalogReader],
})
export class CatalogCoreModule {}
