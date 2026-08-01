import { Injectable } from '@angular/core';
import { BuildInfo, settingsContract } from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

/**
 * What is deployed, for the admin panel's footer line. Memoized for the app's
 * lifetime: the answer cannot change without a redeploy, which replaces the
 * running app anyway.
 */
@Injectable({ providedIn: 'root' })
export class BuildInfoService {
  private readonly client = createApiClient(settingsContract);
  private info?: Promise<BuildInfo>;

  get(): Promise<BuildInfo> {
    return (this.info ??= this.fetch());
  }

  private async fetch(): Promise<BuildInfo> {
    const response = await this.client.getBuildInfo();
    if (response.status === 200) {
      return response.body;
    }
    throw new Error(`Failed to read build info (status ${response.status})`);
  }
}
