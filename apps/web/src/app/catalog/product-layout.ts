import {
  DOCUMENT,
  inject,
  Injectable,
  PLATFORM_ID,
  REQUEST,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** How a listing draws its products: fitted cards, or full-width lines. */
export type ProductLayout = 'grid' | 'list';

/**
 * A cookie rather than localStorage, which is where the rest of this app's
 * browser state lives (the cart, the consent record).
 *
 * The catalogue and the search results are server-rendered, and the layout is
 * markup: cards and lines are different elements, not one set of elements with
 * two stylesheets. A preference the server cannot read would mean rendering
 * the grid for everybody and rearranging the page once Angular had booted —
 * the very second picture the cart shell and the session hint exist to avoid.
 * The cookie travels with the request, so the first HTML is already the layout
 * the visitor chose.
 *
 * It is written only when the visitor presses one of the two buttons, carries
 * nothing but `grid` or `list`, and is read by this app alone.
 */
export const PRODUCT_LAYOUT_COOKIE = 'product_layout';

/** A year: a display preference that expires is a preference the visitor has
 * to state again for no reason they can see. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** The layout from a cookie header, or null where it names none. Anything
 * unrecognised reads as none: the cookie is editable by hand. */
export function readProductLayout(
  cookies: string | undefined,
): ProductLayout | null {
  const match = cookies?.match(
    new RegExp(`(?:^|;\\s*)${PRODUCT_LAYOUT_COOKIE}=([^;]*)`),
  );
  const value = match?.[1] ? decodeURIComponent(match[1]) : '';
  return value === 'grid' || value === 'list' ? value : null;
}

/**
 * The visitor's chosen listing layout (FR-CAT-06), shared by the category grid
 * and the search results so a choice made on one holds on the other.
 *
 * Read from the request on the server and from `document.cookie` in the
 * browser, so both passes render the same markup and hydration has nothing to
 * correct.
 */
@Injectable({ providedIn: 'root' })
export class ProductLayoutService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });

  private readonly chosen = signal<ProductLayout>(this.read() ?? 'grid');

  /** Cards until the visitor says otherwise: a grid is what a catalogue looks
   * like, and it is the layout every other page links into. */
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
