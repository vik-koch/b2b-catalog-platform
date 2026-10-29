import { Module } from '@nestjs/common';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCategoriesService } from './categories/admin-categories.service';
import { AdminProductsService } from './products/admin-products.service';
import { AuditLogger } from '../../audit/audit.logger';
import { AuthModule } from '../../auth/auth.module';
import { SettingsModule } from '../../settings/settings.module';
// eslint-disable-next-line boundaries/dependencies -- until the product page read moves to core
import { CatalogModule } from '../../storefront/catalog/catalog.module';
import {
  ALTERNATE_LAYOUT,
  LOW_STOCK_THRESHOLD_PIECES,
  loadAlternateLayout,
  loadLowStockThresholdPieces,
} from '../../config/deployment-config';

/**
 * The admin's catalog write surface (FR-ADM): products and categories, behind
 * the `@Auth('admin')` guards AuthModule supplies.
 */
@Module({
  imports: [AuthModule, SettingsModule, CatalogModule],
  controllers: [AdminCatalogController],
  providers: [
    AdminProductsService,
    AdminCategoriesService,
    AuditLogger,
    {
      provide: LOW_STOCK_THRESHOLD_PIECES,
      useFactory: loadLowStockThresholdPieces,
    },
    { provide: ALTERNATE_LAYOUT, useFactory: loadAlternateLayout },
  ],
})
export class AdminCatalogModule {}
