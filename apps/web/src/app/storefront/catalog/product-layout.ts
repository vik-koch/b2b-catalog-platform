import { isPlatformBrowser } from '@angular/common';
import {
  DOCUMENT,
  inject,
  Injectable,
  PLATFORM_ID,
  REQUEST,
  signal,
} from '@angular/core';
import { cookieValue } from '../../shared/core/cookie';

export type ProductLayout = 'grid' | 'list';

/** A cookie, unlike the rest of the browser state: cards and lines are
 * different markup, and the server must render the chosen one or the page
 * rearranges after boot. */
export const PRODUCT_LAYOUT_COOKIE = 'product_layout';

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function readProductLayout(
  cookies: string | undefined,
): ProductLayout | null {
  const value = cookieValue(cookies, PRODUCT_LAYOUT_COOKIE);
  return value === 'grid' || value === 'list' ? value : null;
}

/** The visitor's listing layout (FR-CAT-06), one choice for categories and
 * search alike. */
@Injectable({ providedIn: 'root' })
export class ProductLayoutService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });

  private readonly chosen = signal<ProductLayout>(this.read() ?? 'grid');

  readonly layout = this.chosen.asReadonly();

  set(layout: ProductLayout): void {
    this.chosen.set(layout);
    if (!this.isBrowser) return;
    this.document.cookie = `${PRODUCT_LAYOUT_COOKIE}=${layout};path=/;max-age=${MAX_AGE_SECONDS};samesite=lax`;
  }

  private read(): ProductLayout | null {
    return readProductLayout(
      this.isBrowser
        ? this.document.cookie
        : (this.request?.headers.get('cookie') ?? undefined),
    );
  }
}
