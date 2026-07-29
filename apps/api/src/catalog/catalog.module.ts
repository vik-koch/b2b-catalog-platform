import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminCatalogService } from './admin-catalog.service';
import { AuthModule } from '../auth/auth.module';

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
  providers: [CatalogService, AdminCatalogService],
})
export class CatalogModule {}
