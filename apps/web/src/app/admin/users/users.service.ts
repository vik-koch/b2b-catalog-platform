import { Injectable } from '@angular/core';
import {
  ListUsersQuery,
  StaffUser,
  usersContract,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../../core/api-client';

/**
 * The staff account client — the counterpart to the API's StaffUsersController.
 * Same discipline as AdminCatalogService: the list is the whole read surface,
 * and only the unexpected throws. Filters are applied server-side; sorting is
 * the page's own job, since the list is small and unpaged.
 */
@Injectable({ providedIn: 'root' })
export class StaffUsersService {
  private client = createApiClient(usersContract);

  /** The account list, narrowed by the grid's filters and search box. */
  async list(query: ListUsersQuery = {}): Promise<StaffUser[]> {
    const response = await this.client.listUsers({ query });
    if (response.status === 200) return response.body.users;
    throw new Error(`Failed to list accounts (status ${response.status})`);
  }
}
