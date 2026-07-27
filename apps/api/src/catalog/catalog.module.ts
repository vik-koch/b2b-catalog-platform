import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';

/**
 * Read-only storefront catalog (FR-CAT). No dependencies yet — the controller
 * is backed by an in-memory seed. When the DB-backed read model lands, a
 * service + DatabaseModule import slot in here.
 */
@Module({
  controllers: [CatalogController],
})
export class CatalogModule {}
