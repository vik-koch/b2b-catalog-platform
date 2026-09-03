import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCategoriesService } from './admin-categories.service';
import { AdminProductsService } from './admin-products.service';
import { AuditLogger } from '../audit/audit.logger';
import { AuthModule } from '../auth/auth.module';
import { SearchLogger } from './search.logger';
import {
  LOW_STOCK_THRESHOLD_PIECES,
  loadLowStockThresholdPieces,
} from '../config/deployment-config';

/**
 * Catalog: the read-only storefront (FR-CAT, CatalogController/Service) and the
 * admin write surface (AdminCatalog*). DatabaseModule is @Global, so DRIZZLE
 * is available without importing it; AuthModule supplies * JwtAuthGuard /
 * RolesGuard for the admin controller's `@Auth('admin')` routes
 * (the read controller stays public).
 */
@Module({
  imports: [AuthModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [
    CatalogService,
    AdminProductsService,
    AdminCategoriesService,
    AuditLogger,
    SearchLogger,
    {
      provide: LOW_STOCK_THRESHOLD_PIECES,
      useFactory: loadLowStockThresholdPieces,
    },
  ],
})
export class CatalogModule {}
