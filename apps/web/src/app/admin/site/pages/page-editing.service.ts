import { Injectable } from '@angular/core';
import { Page, PageSlug } from '@b2b-catalog-platform/shared/core/site';
import {
  PageVersion,
  UpdatePageRequest,
} from '@b2b-catalog-platform/shared/admin/site';
import { adminPagesContract } from '../../contract-routes.generated';
import { createOrpcClient } from '../../../shared/core/orpc-client';

/** Writing a page and reading its history; reading a page is `PageService`. */
@Injectable({ providedIn: 'root' })
export class PageEditingService {
  private client = createOrpcClient(adminPagesContract);

  /** Returns the stored page, so callers render what the server kept. */
  updatePage(slug: PageSlug, body: UpdatePageRequest): Promise<Page> {
    return this.client.updatePage({ params: { slug }, body });
  }

  /** Newest first. */
  listVersions(slug: PageSlug): Promise<PageVersion[]> {
    return this.client.listPageVersions({ params: { slug } });
  }
}
