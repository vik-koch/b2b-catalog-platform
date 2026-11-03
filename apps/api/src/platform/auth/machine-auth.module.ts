import { Module } from '@nestjs/common';
import { MachineTokenGuard } from './machine-token.guard';
import { MachineTokens } from './machine-tokens';

/** The guard behind `@Machine(...)`, for any module with machine routes. */
@Module({
  providers: [MachineTokens, MachineTokenGuard],
  exports: [MachineTokens, MachineTokenGuard],
})
export class MachineAuthModule {}
