import { Injectable } from '@angular/core';
import { ConsentRecord, FindConsentsQuery } from '@b2b-catalog-platform/shared';
import { consentsContract } from '../../core/contract-routes.generated';
import { createOrpcClient } from '../../core/orpc-client';

/** The consent lookup's client: the API's ConsentAdminController. */
@Injectable({ providedIn: 'root' })
export class ConsentsService {
  private client = createOrpcClient(consentsContract);

  async find(query: FindConsentsQuery): Promise<ConsentRecord[]> {
    return (await this.client.findConsents({ query })).consents;
  }
}
