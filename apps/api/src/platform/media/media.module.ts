import { Module } from '@nestjs/common';
import { MEDIA_STORE } from './media-store';
import { LocalMediaStore } from './local-media-store';

/** The media store, bound to the local-volume adapter. */
@Module({
  providers: [{ provide: MEDIA_STORE, useClass: LocalMediaStore }],
  exports: [MEDIA_STORE],
})
export class MediaModule {}
