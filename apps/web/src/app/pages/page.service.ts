import { Injectable } from '@angular/core';
import {
  Page,
  pageContract,
  PageSlug,
  UpdatePageRequest,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

@Injectable({ providedIn: 'root' })
export class PageService {
  private client = createApiClient(pageContract);

  /**
   * The page, or null when it has no row yet. A deployment starts with an empty
   * pages table — nothing seeds it outside the demo — so "not created yet" is an
   * ordinary state the admin resolves by writing the page, not a failure. Any
   * other status still throws, so a real outage stays distinguishable from an
   * empty page.
   */
  async getPage(slug: string): Promise<Page | null> {
    const response = await this.client.getPage({ params: { slug } });

    if (response.status === 200) {
      return response.body;
    }
    if (response.status === 404) {
      return null;
    }

    throw new Error(
      `Failed to load page "${slug}" (status ${response.status})`,
    );
  }

  /** Returns the stored page, so callers render what the server kept. */
  async updatePage(slug: PageSlug, body: UpdatePageRequest): Promise<Page> {
    const response = await this.client.updatePage({ params: { slug }, body });

    if (response.status === 200) {
      return response.body;
    }

    throw new Error(
      `Failed to save page "${slug}" (status ${response.status})`,
    );
  }
}
