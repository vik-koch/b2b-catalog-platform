import { Module } from '@nestjs/common';
import { MaintenanceState } from './maintenance-state';

/**
 * Apart from the gate's module: sign-in reads this before it lets a customer
 * in, without the gate's own wiring.
 */
@Module({
  providers: [MaintenanceState],
  exports: [MaintenanceState],
})
export class MaintenanceStateModule {}
