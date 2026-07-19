import { Injectable } from '@angular/core';
import { pageContract } from '@b2b-catalog-platform/shared';
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
}
