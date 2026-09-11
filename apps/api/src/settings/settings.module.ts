import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { MaintenanceGuard } from './maintenance.guard';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

/**
 * Runtime settings and the maintenance gate. AuthModule supplies the `@Auth`
 * guards for the admin toggle routes and the JwtService/UsersService the
 * maintenance guard uses for its admin-session bypass check. MaintenanceGuard is
 * registered as an APP_GUARD so it runs on every route ahead of the per-route
 * auth guards.
 */
@Module({
  imports: [AuthModule],
  controllers: [SettingsController],
  providers: [
    SettingsService,
    { provide: APP_GUARD, useClass: MaintenanceGuard },
  ],
  // The catalog and sync modules ask it whether an area is externally owned
  // before they accept a write (FR-ADM-10).
  exports: [SettingsService],
})
export class SettingsModule {}
