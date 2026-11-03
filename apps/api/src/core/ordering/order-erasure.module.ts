import { Module } from '@nestjs/common';
import { MediaModule } from '../../media/media.module';
import { OrderCounts } from './order-counts';
import { OrderDocumentFiles } from './order-document-files';
import { OrderErasure } from './order-erasure';

/** Ordering's answers to accounts: the erasure step and the order counts. */
@Module({
  // The document store the supplied files are removed from.
  imports: [MediaModule],
  providers: [OrderErasure, OrderDocumentFiles, OrderCounts],
  exports: [OrderErasure, OrderCounts],
})
export class OrderErasureModule {}
