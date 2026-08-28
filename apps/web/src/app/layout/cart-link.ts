import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService } from '../cart/cart.service';
import { currentUrl } from '../core/current-url';
import { formatPriceMinor, formatPriceMinorShort } from '../catalog/price';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { Icon } from '../ui/icons/icon';
import {
  NAV_ACTION,
  NAV_ACTION_LABEL,
  NAV_ACTION_LABEL_ROW,
} from './nav-action';
import { fillText } from '@b2b-catalog-platform/shared';

/**
 * The cart control in the main navbar (FR-CART-01): a link to `/cart` carrying
 * the line count and the running total, both of which the cart computes from
 * the prices it stored — no round trip, and no waiting for the server.
 *
 * **The figures are not in this template.** They are two custom properties and
 * a class on `<html>`, which the stylesheet draws (see `.cart-filled` in
 * styles.css). The cart lives in localStorage, so a server-rendered page is
 * always HTML for an empty cart; anything Angular put right would be the
 * *second* picture the visitor sees, and no amount of rendering earlier avoids
 * that. The inline script in cart-shell.server.ts sets the three values before
 * the first paint, this component sets the same three for the rest of the
 * visit, and the markup around them never changes — so there is nothing left
 * to flip. Client-rendered routes were already flip-free, which is why the
 * admin area looked right while the catalogue did not.
 *
 * The chip's width is not reserved beyond the control's shared minimum, and
 * it may claim the control's own side padding: an amount is as wide as the
 * amount, and the whole 72px of the control is the cart's to use before
 * anything else in the navbar has to move.
 */
@Component({
  selector: 'app-cart-link',
  imports: [RouterLink, Icon],
  template: `
    <a
      routerLink="/cart"
      [attr.aria-current]="active() ? 'page' : null"
      [class]="navAction"
      [attr.aria-label]="ready ? summary() : text.navLabel"
    >
      <!-- inline-flex, not the default inline box: an inline wrapper adds the
           line's descender space under the glyph and pushes the icon off the
           row's centre. -->
      <span class="relative inline-flex">
        <app-icon name="shopping-basket" class="h-6 w-6" />
        <span
          aria-hidden="true"
          class="cart-count absolute -top-1 -right-2 min-w-3 items-center justify-center rounded-full bg-accent px-0.5 py-0.5 text-[0.625rem] leading-3 text-white"
        ></span>
      </span>
      <span [class]="labelRow">
        <!-- The total takes the label's place once there is one, as a chip: it
             is a figure rather than a caption, and a chip stops it reading as
             one more nav word. Its negative side margins let it claim the
             control's own 12px paddings, so it has the full 72px of the
             control to itself before anything in the navbar moves — and past
             that the control grows with it rather than spilling over its
             neighbours. It follows the control's own hover and press colours,
             so the whole button still reads as one thing. -->
        <span
          aria-hidden="true"
          class="cart-total -mx-3 items-center justify-center rounded bg-primary px-1 py-1 text-[0.6875rem] leading-4 font-medium whitespace-nowrap text-white transition-colors group-hover:bg-accent group-active:bg-secondary"
        ></span>
        <span
          class="cart-label {{ labelClass }}"
          [attr.data-label]="text.navLabel"
        >
          {{ text.navLabel }}
        </span>
      </span>
    </a>
  `,
})
export class CartLink {
  private readonly cart = inject(CartService);
  private readonly url = currentUrl();

  /**
   * Computed from the URL rather than left to `routerLinkActive`, which sets
   * `aria-current` only after the first render — so the label was drawn at its
   * resting weight and went medium a frame later, most visibly on a reload of
   * the cart itself. `currentUrl` has the answer before anything is drawn.
   */
  protected readonly active = computed(
    () => this.url().split(/[?#]/)[0] === '/cart',
  );
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly text = inject(APP_TEXT).cart;
  protected readonly navAction = NAV_ACTION;
  protected readonly labelClass = NAV_ACTION_LABEL;
  protected readonly labelRow = NAV_ACTION_LABEL_ROW;

  /** False on the server, where there is no cart to read and any figure
   * announced would be one the visitor's own browser is about to replace. */
  protected readonly ready = this.isBrowser;

  protected readonly count = this.cart.count;

  /**
   * A cart with an unpriceable line shows what the rest of it costs; the cart
   * page is where the missing figure is explained. The cents are dropped: a
   * figure that changes width with them moves every icon in the navbar, and
   * this is a glance rather than a receipt.
   */
  protected readonly total = computed(() =>
    formatPriceMinorShort(this.cart.totalMinor(), this.currency),
  );

  /** One sentence, because a badge read on its own says nothing — and with the
   * exact total, since a spoken label costs the navbar no width. */
  protected readonly summary = computed(() =>
    fillText(this.text.summaryLabel, {
      count: this.count(),
      total: formatPriceMinor(this.cart.totalMinor(), this.currency),
    }),
  );

  constructor() {
    if (!this.isBrowser) return;
    effect(() => writeCartFigures(this.count(), this.total()));
  }
}

/**
 * The one writer of the cart's presentation state after the first paint — the
 * inline script is the other, and they agree on all three values by
 * construction. Emptying the cart takes the class off again, which is what
 * puts the "Cart" label back.
 */
function writeCartFigures(count: number, total: string): void {
  const root = document.documentElement;
  if (count === 0) {
    root.classList.remove('cart-filled');
    root.style.removeProperty('--cart-count');
    root.style.removeProperty('--cart-total');
    return;
  }
  // JSON quoting, because `content` takes a CSS string and the total carries
  // spaces and a currency sign.
  root.style.setProperty('--cart-count', JSON.stringify(String(count)));
  root.style.setProperty('--cart-total', JSON.stringify(total));
  root.classList.add('cart-filled');
}
