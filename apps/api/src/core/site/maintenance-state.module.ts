import { Module } from '@nestjs/common';
import { MaintenanceState } from './maintenance-state';

/**
 * Apart from the gate's module, which imports AuthModule: AuthModule reads
 * this before it signs a customer in.
 */
@Module({
  providers: [MaintenanceState],
  exports: [MaintenanceState],
})
export class MaintenanceStateModule {}
