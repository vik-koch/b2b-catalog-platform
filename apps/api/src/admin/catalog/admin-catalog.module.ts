import { Module } from '@nestjs/common';

import {
  loadLowStockThresholdPieces,
  LOW_STOCK_THRESHOLD_PIECES,
} from '../../core/catalog/catalog-config';
import { CatalogCoreModule } from '../../core/catalog/catalog-core.module';
import { AuditLogger } from '../../platform/audit/audit.logger';
import { SessionModule } from '../../platform/auth/session.module';
import {
  ALTERNATE_LAYOUT,
  loadAlternateLayout,
} from '../../platform/config/deployment-config';
import { MediaModule } from '../../platform/media/media.module';
import { OwnershipStateModule } from '../../platform/settings/ownership-state.module';
import { AttributesController } from './attributes/attributes.controller';
import { AttributesService } from './attributes/attributes.service';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { ProductGridService } from './products/grid/product-grid.service';
import { ProductEditorService } from './products/product-editor.service';
import { ProductLifecycleService } from './products/product-lifecycle.service';
import { ProductRecords } from './products/product-records';
import { ProductsController } from './products/products.controller';
import { TiersController } from './tiers/tiers.controller';
import { TiersService } from './tiers/tiers.service';
import { CatalogUploadsController } from './uploads/catalog-uploads.controller';

/**
 * The admin's catalog: products, categories, the attribute registry, documents
 * and tiers, behind the `@Auth` guards SessionModule supplies.
 */
@Module({
  imports: [
    SessionModule,
    OwnershipStateModule,
    CatalogCoreModule,
    MediaModule,
  ],
  controllers: [
    ProductsController,
    CategoriesController,
    AttributesController,
    DocumentsController,
    TiersController,
    CatalogUploadsController,
  ],
  providers: [
    ProductRecords,
    ProductGridService,
    ProductEditorService,
    ProductLifecycleService,
    CategoriesService,
    AttributesService,
    DocumentsService,
    TiersService,
    AuditLogger,
    {
      provide: LOW_STOCK_THRESHOLD_PIECES,
      useFactory: loadLowStockThresholdPieces,
    },
    { provide: ALTERNATE_LAYOUT, useFactory: loadAlternateLayout },
  ],
})
export class AdminCatalogModule {}
