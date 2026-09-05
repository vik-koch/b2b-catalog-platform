import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditLogger } from '../audit/audit.logger';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

/**
 * Product documents (FR-DOC). Its own module rather than part of the catalog:
 * a document is a record of its own, shown by products but owned by none of
 * them. The bytes belong to the media module, which is where every upload
 * gate lives.
 */
@Module({
  imports: [AuthModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, AuditLogger],
  exports: [DocumentsService],
})
export class DocumentsModule {}
