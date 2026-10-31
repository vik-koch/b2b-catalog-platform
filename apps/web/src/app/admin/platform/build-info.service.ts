import { Injectable } from '@angular/core';
import { BuildInfo } from '@b2b-catalog-platform/shared/admin/platform';
import { adminOperationsContract } from '../contract-routes.generated';
import { createOrpcClient } from '../../shared/core/orpc-client';

/**
 * What is deployed, for the admin panel's footer line. Memoized for the app's
 * lifetime: the answer cannot change without a redeploy, which replaces the
 * running app anyway.
 */
@Injectable({ providedIn: 'root' })
export class BuildInfoService {
  private readonly client = createOrpcClient(adminOperationsContract);
  private info?: Promise<BuildInfo>;

  get(): Promise<BuildInfo> {
    return (this.info ??= this.client.getBuildInfo());
  }
}
