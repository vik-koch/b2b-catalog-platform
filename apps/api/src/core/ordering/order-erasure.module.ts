import { Module } from '@nestjs/common';
import { MediaModule } from '../../media/media.module';
import { OrderDocumentFiles } from './order-document-files';
import { OrderErasure } from './order-erasure';

@Module({
  // The document store the supplied files are removed from.
  imports: [MediaModule],
  providers: [OrderErasure, OrderDocumentFiles],
  exports: [OrderErasure],
})
export class OrderErasureModule {}
