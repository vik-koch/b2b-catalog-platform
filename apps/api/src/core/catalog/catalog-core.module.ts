import { Module } from '@nestjs/common';
import { CatalogReader } from './catalog-reader';
import { loadTaxConfig, TAX_CONFIG } from '../../config/deployment-config';

/** What both audiences' catalog modules read through. */
@Module({
  providers: [
    CatalogReader,
    { provide: TAX_CONFIG, useFactory: loadTaxConfig },
  ],
  exports: [CatalogReader],
})
export class CatalogCoreModule {}
