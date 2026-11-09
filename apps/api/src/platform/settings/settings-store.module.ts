import { Global, Module } from '@nestjs/common';

import { SettingsStore } from './settings-store';

/** Global: every area's switch reads through the one store. */
@Global()
@Module({
  providers: [SettingsStore],
  exports: [SettingsStore],
})
export class SettingsStoreModule {}
