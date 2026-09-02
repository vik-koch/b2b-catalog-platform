import { Injectable } from '@angular/core';
import { BuildInfo, settingsContract } from '@b2b-catalog-platform/shared';
import { createOrpcClient } from '../core/orpc-client';

/**
 * What is deployed, for the admin panel's footer line. Memoized for the app's
 * lifetime: the answer cannot change without a redeploy, which replaces the
 * running app anyway.
 */
@Injectable({ providedIn: 'root' })
export class BuildInfoService {
  private readonly client = createOrpcClient(settingsContract);
  private info?: Promise<BuildInfo>;

  get(): Promise<BuildInfo> {
    return (this.info ??= this.client.getBuildInfo());
  }
}
