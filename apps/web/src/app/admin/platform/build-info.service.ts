import { Injectable } from '@angular/core';
import { BuildInfo } from '@b2b-catalog-platform/shared/admin/platform';
import { adminOperationsContract } from '../contract-routes.generated';
import { createOrpcClient } from '../../shared/core/orpc-client';

/** Memoized: only a redeploy changes it, and that replaces the app. */
@Injectable({ providedIn: 'root' })
export class BuildInfoService {
  private readonly client = createOrpcClient(adminOperationsContract);
  private info?: Promise<BuildInfo>;

  get(): Promise<BuildInfo> {
    return (this.info ??= this.client.getBuildInfo());
  }
}
