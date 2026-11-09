import { Module } from '@nestjs/common';

import { loadTaxConfig, TAX_CONFIG } from './catalog-config';
import { CatalogReader } from './catalog-reader';

/** What both audiences' catalog modules read through. */
@Module({
  providers: [
    CatalogReader,
    { provide: TAX_CONFIG, useFactory: loadTaxConfig },
  ],
  exports: [CatalogReader],
})
export class CatalogCoreModule {}
