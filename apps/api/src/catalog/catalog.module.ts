import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

/**
 * Read-only storefront catalog (FR-CAT). Backed by the database via
 * CatalogService; the write side (file sync, FR-ADM) lands separately.
 * DatabaseModule is @Global, so DRIZZLE is available without importing it.
 */
@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
