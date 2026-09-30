import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { MaintenanceGuard } from './maintenance.guard';
import { SettingsController } from './settings.controller';
import { SettingsStateModule } from './settings-state.module';

/**
 * Runtime settings and the maintenance gate. AuthModule supplies the `@Auth`
 * guards for the admin toggle routes and the JwtService/UsersService the
 * maintenance guard uses for its staff-session bypass check. MaintenanceGuard is
 * registered as an APP_GUARD so it runs on every route ahead of the per-route
 * auth guards.
 */
@Module({
  imports: [AuthModule, SettingsStateModule],
  controllers: [SettingsController],
  providers: [{ provide: APP_GUARD, useClass: MaintenanceGuard }],
  // The catalog and sync modules ask it whether an area is externally owned
  // before they accept a write (FR-ADM-10).
  exports: [SettingsStateModule],
})
export class SettingsModule {}
