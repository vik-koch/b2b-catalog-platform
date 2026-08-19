import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditLogger } from '../audit/audit.logger';
import { AttributesController } from './attributes.controller';
import { AttributesService } from './attributes.service';

/**
 * The filterable-attribute registry. Its own module rather than part of the
 * catalog: it stores no product data, and the catalog reads it only when it
 * builds facets.
 */
@Module({
  imports: [AuthModule],
  controllers: [AttributesController],
  providers: [AttributesService, AuditLogger],
  exports: [AttributesService],
})
export class AttributesModule {}
