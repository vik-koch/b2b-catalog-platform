import { Module } from '@nestjs/common';
import { MachineTokenGuard } from './machine-token.guard';

/** The guard behind `@Machine(...)`, for any module with machine routes. */
@Module({
  providers: [MachineTokenGuard],
  exports: [MachineTokenGuard],
})
export class MachineAuthModule {}
