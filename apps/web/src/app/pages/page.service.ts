import { Injectable } from '@angular/core';
import { isDefinedError, safe } from '@orpc/client';
import {
  Page,
  pageContract,
  PageSlug,
  UpdatePageRequest,
} from '@b2b-catalog-platform/shared';
import { createOrpcClient } from '../core/orpc-client';

@Injectable({ providedIn: 'root' })
export class PageService {
  private client = createOrpcClient(pageContract);

  /**
   * The page, or null when it has no row yet. A deployment starts with an empty
   * pages table — nothing seeds it outside the demo — so "not created yet" is an
   * ordinary state the admin resolves by writing the page, not a failure. Any
   * other failure still throws, so a real outage stays distinguishable from an
   * empty page.
   */
  async getPage(slug: string): Promise<Page | null> {
    const { error, data } = await safe(
      this.client.getPage({ params: { slug } }),
    );

    if (!error) return data;
    if (isDefinedError(error) && error.code === 'page-not-found') return null;
    throw error;
  }

  /** Returns the stored page, so callers render what the server kept. */
  updatePage(slug: PageSlug, body: UpdatePageRequest): Promise<Page> {
    return this.client.updatePage({ params: { slug }, body });
  }
}
