import { Module } from '@nestjs/common';
import { loadRetention, RETENTION } from '../config/deployment-config';
import { RetentionSweep } from './retention-sweep';

@Module({
  providers: [
    RetentionSweep,
    { provide: RETENTION, useFactory: loadRetention },
  ],
  exports: [RetentionSweep],
})
export class DestructionModule {}
