import { isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
import { CatalogService } from '../catalog/catalog.service';

/**
 * The main page's row as first drawn in this tab (FR-CAT-09).
 *
 * The API draws a new row on every request, which is right for a fresh visit
 * and wrong for the way back: somebody who opens a product from the row and
 * returns would find it gone. So the browser keeps the first draw for as long
 * as the app runs — a reload is a new visit and draws again.
 *
 * Signing in or out forgets it, because the prices on it were the previous
 * visitor's. The first answer from the session does not: the draw that
 * preceded it already went out with the cookie, so its prices are right.
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
