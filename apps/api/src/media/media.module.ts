import { Module } from '@nestjs/common';
import { MEDIA_STORE } from './media-store';
import { LocalMediaStore } from './local-media-store';
import { MediaController } from './media.controller';
import { SessionModule } from '../platform/auth/session.module';

/**
 * Wires the image upload endpoint to the MediaStore port, bound to the
 * local-volume adapter. Swapping the adapter (e.g. an S3-compatible
 * store) is a one-line change here — no call site changes.
 */
@Module({
  imports: [SessionModule],
  controllers: [MediaController],
  providers: [{ provide: MEDIA_STORE, useClass: LocalMediaStore }],
  exports: [MEDIA_STORE],
})
export class MediaModule {}
