import { Global, Module } from '@nestjs/common';
import { SettingsStore } from './settings-store';

/**
 * Global, like DatabaseModule: every area's switch reads through the one
 * store, and the auth module, which the switches' own modules import, is one
 * of its readers.
 */
@Global()
@Module({
  providers: [SettingsStore],
  exports: [SettingsStore],
})
export class SettingsStoreModule {}
