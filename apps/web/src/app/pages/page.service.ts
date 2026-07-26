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

  async getPage(slug: string) {
    const response = await this.client.getPage({ params: { slug } });

    if (response.status === 200) {
      return response.body;
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
