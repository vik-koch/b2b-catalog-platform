import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../../auth/auth.module';
import { MaintenanceGuard } from './maintenance.guard';
import { MaintenanceStateModule } from './maintenance-state.module';

/**
 * The maintenance gate, on every route of every audience. AuthModule supplies
 * the JwtService/UsersService the gate uses for its staff-session bypass. An
 * APP_GUARD runs ahead of the per-route auth guards.
 */
@Module({
  imports: [AuthModule, MaintenanceStateModule],
  providers: [{ provide: APP_GUARD, useClass: MaintenanceGuard }],
})
export class SiteCoreModule {}
