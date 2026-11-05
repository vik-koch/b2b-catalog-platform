import { Module } from '@nestjs/common';
import { loadRetention, RETENTION } from './retention-config';
import { MediaModule } from '../../platform/media/media.module';
import { OrderDocumentFiles } from '../ordering/order-document-files';
import { RetentionSweep } from './retention-sweep';

@Module({
  // An order's retention also ends its files.
  imports: [MediaModule],
  providers: [
    RetentionSweep,
    OrderDocumentFiles,
    { provide: RETENTION, useFactory: loadRetention },
  ],
  exports: [RetentionSweep],
})
export class RetentionModule {}
