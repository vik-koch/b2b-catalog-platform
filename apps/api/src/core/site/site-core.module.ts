import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { SessionModule } from '../../platform/auth/session.module';
import { MaintenanceStateModule } from './maintenance-state.module';
import { MaintenanceGuard } from './maintenance.guard';

/**
 * The maintenance gate on every route of every audience, ahead of the
 * per-route auth guards. SessionModule supplies its staff-session check.
 */
@Module({
  imports: [SessionModule, MaintenanceStateModule],
  providers: [{ provide: APP_GUARD, useClass: MaintenanceGuard }],
})
export class SiteCoreModule {}
