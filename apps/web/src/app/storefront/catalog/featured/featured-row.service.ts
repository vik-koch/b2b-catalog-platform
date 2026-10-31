import { isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { ProductListItem } from '@b2b-catalog-platform/shared/core/catalog';
import { AuthService } from '../../../shared/auth/auth.service';
import { CatalogService } from '../catalog.service';

/**
 * The main page's row as first drawn in this tab (FR-CAT-09). The API draws a
 * new row per request, so coming back from a product would find it changed;
 * a reload is a new visit and draws again. Signing in or out forgets it, the
 * prices being the previous visitor's; the session's first answer does not,
 * the draw before it having gone out with the cookie.
 */
@Injectable({ providedIn: 'root' })
export class FeaturedRowService {
  private readonly catalog = inject(CatalogService);
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private kept: ProductListItem[] | null = null;

  constructor() {
    let viewer: string | null | undefined;
    effect(() => {
      if (!this.auth.resolved()) return;
      const id = this.auth.user()?.id ?? null;
      if (viewer !== undefined && viewer !== id) this.kept = null;
      viewer = id;
    });
  }

  async row(): Promise<ProductListItem[]> {
    if (this.kept) return this.kept;
    const items = await this.catalog.getFeaturedProducts();
    if (this.isBrowser) this.kept = items;
    return items;
  }
}
