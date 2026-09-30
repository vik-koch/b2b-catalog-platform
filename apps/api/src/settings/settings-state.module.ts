import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';

/**
 * The settings singleton on its own, with nothing it depends on but the
 * database. Split out so AuthModule can ask whether the shop is closed before
 * it signs a customer in: SettingsModule itself imports AuthModule for its
 * guards, and the two could not import each other.
 */
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsStateModule {}
