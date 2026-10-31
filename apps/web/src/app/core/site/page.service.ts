import { Injectable } from '@angular/core';
import { isDefinedError, safe } from '@orpc/client';
import { Page } from '@b2b-catalog-platform/shared/core/site';
import { pageContract } from '../../shared/core/contract-routes.generated';
import { createOrpcClient } from '../../shared/core/orpc-client';

@Injectable({ providedIn: 'root' })
export class PageService {
  private client = createOrpcClient(pageContract);

  /**
   * Null for a page with no row yet, an ordinary state outside the demo; any
   * other failure throws, so an outage stays distinct from an unwritten page.
   */
  async getPage(slug: string): Promise<Page | null> {
    const { error, data } = await safe(
      this.client.getPage({ params: { slug } }),
    );

    if (!error) return data;
    if (isDefinedError(error) && error.code === 'page-not-found') return null;
    throw error;
  }
}
