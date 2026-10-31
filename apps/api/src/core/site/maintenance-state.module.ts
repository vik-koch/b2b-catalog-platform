import { Module } from '@nestjs/common';
import { MaintenanceState } from './maintenance-state';

/**
 * The reader on its own, with nothing it depends on but the global store, so
 * AuthModule can ask whether the shop is closed before it signs a customer in:
 * the module that holds the gate imports AuthModule for its guards.
 */
@Module({
  providers: [MaintenanceState],
  exports: [MaintenanceState],
})
export class MaintenanceStateModule {}
