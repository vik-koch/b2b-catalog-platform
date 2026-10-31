import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { ProductsController } from './products/products.controller';
import { CategoriesService } from './categories/categories.service';
import { ProductEditorService } from './products/product-editor.service';
import { ProductGridService } from './products/grid/product-grid.service';
import { ProductLifecycleService } from './products/product-lifecycle.service';
import { ProductRecords } from './products/product-records';
import { AttributesController } from './attributes/attributes.controller';
import { AttributesService } from './attributes/attributes.service';
import { DocumentsController } from './documents/documents.controller';
import { DocumentsService } from './documents/documents.service';
import { TiersController } from './tiers/tiers.controller';
import { TiersService } from './tiers/tiers.service';
import { AuditLogger } from '../../audit/audit.logger';
import { AuthModule } from '../../auth/auth.module';
import { SettingsModule } from '../../settings/settings.module';
import { CatalogCoreModule } from '../../core/catalog/catalog-core.module';
import {
  ALTERNATE_LAYOUT,
  LOW_STOCK_THRESHOLD_PIECES,
  loadAlternateLayout,
  loadLowStockThresholdPieces,
} from '../../config/deployment-config';

/**
 * The admin's catalog: products, categories, the attribute registry, documents
 * and tiers, behind the `@Auth` guards AuthModule supplies.
 */
@Module({
  imports: [AuthModule, SettingsModule, CatalogCoreModule],
  controllers: [
    ProductsController,
    CategoriesController,
    AttributesController,
    DocumentsController,
    TiersController,
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
