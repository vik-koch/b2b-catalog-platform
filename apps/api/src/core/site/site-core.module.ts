import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../../auth/auth.module';
import { MaintenanceGuard } from './maintenance.guard';
import { MaintenanceStateModule } from './maintenance-state.module';

/**
 * The maintenance gate on every route of every audience, ahead of the
 * per-route auth guards. AuthModule supplies its staff-session check.
 */
@Module({
  imports: [AuthModule, MaintenanceStateModule],
  providers: [{ provide: APP_GUARD, useClass: MaintenanceGuard }],
})
export class SiteCoreModule {}
