import { Injectable } from '@angular/core';
import { SettingChange } from '@b2b-catalog-platform/shared/admin/platform';
import { adminOperationsContract } from '../contract-routes.generated';
import { createOrpcClient } from '../../shared/core/orpc-client';

/** The trail of changes to the runtime switches, newest first. */
@Injectable({ providedIn: 'root' })
export class SettingChangesService {
  private readonly client = createOrpcClient(adminOperationsContract);

  async list(): Promise<SettingChange[]> {
    return (await this.client.listSettingChanges()).changes;
  }
}
