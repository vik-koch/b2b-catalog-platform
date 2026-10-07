import { Module } from '@nestjs/common';
import { loadRetention, RETENTION } from '../config/deployment-config';
import { MediaModule } from '../media/media.module';
import { OrderDocumentFiles } from '../orders/order-document-files';
import { RetentionSweep } from './retention-sweep';

@Module({
  // The document store: an order whose retention ends loses the files
  // supplied for it, which no column-level scrub can reach.
  imports: [MediaModule],
  providers: [
    RetentionSweep,
    OrderDocumentFiles,
    { provide: RETENTION, useFactory: loadRetention },
  ],
  exports: [RetentionSweep],
})
export class DestructionModule {}
