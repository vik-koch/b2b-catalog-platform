import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, input, PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  moneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared/platform';
import { CartService } from './cart.service';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { currentPath } from '../../../platform/current-url';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { navActionClasses, NavVariant } from '../../platform/nav-action';
import { shoppingBasketIcon } from '@b2b-catalog-platform/ui/icons/glyphs/shopping-basket';

/** The navbar cart control (FR-CART-01): count and total from the stored
 * prices. **The figures are not in this template**: the cart is in
 * localStorage, so SSR HTML is always an empty cart. The pre-paint script in
 * cart-shell.server.ts and CartFigures set two custom properties and a class on
 * `<html>`, which styles.css draws (`.cart-filled`), so nothing flips at
 * hydration. The total may claim the control's side padding. The bottom bar
 * shows no total: the badge is enough, and the spoken label carries it. */
@Component({
  selector: 'app-cart-link',
  imports: [RouterLink, Icon],
  template: `
    <a
      routerLink="/cart"
      [attr.aria-current]="active() ? 'page' : null"
      [class]="cls().action"
      [attr.aria-label]="ready ? summary() : text.navLabel"
    >
      <!-- inline-flex: an inline box adds descender space and moves the icon
           off centre. -->
      <span class="relative inline-flex">
        <ui-icon [glyph]="shoppingBasketIcon" class="size-6" />
        <!-- The waiting-work dot: a filled cart is work too. White on it is
             3.2:1; dark digits read as a foreign colour. -->
        <span
          aria-hidden="true"
          class="cart-count absolute -top-0.75 -right-2 h-3 min-w-3
                 items-center justify-center rounded-full bg-warning-dot p-0.5
                 text-[0.625rem]/3 text-white font-normal transition-colors"
        ></span>
      </span>
      <span [class]="cls().labelRow">
        <!-- A chip, so the total does not read as a nav word. Negative margins
             claim the control's 12px paddings before the control grows; it
             shares the control's hover and press colours. -->
        @if (variant() === 'bar') {
          <span
            aria-hidden="true"
            class="cart-total -mx-3 items-center justify-center rounded-sm
                   bg-primary p-1 text-[0.6875rem]/4 font-medium
                   whitespace-nowrap text-white transition-colors
                   group-hover:bg-accent
                   group-active:bg-primary-press"
          ></span>
        }
        <span [class]="labelClass()" [attr.data-label]="text.navLabel">
          {{ text.navLabel }}
        </span>
      </span>
    </a>
  `,
})
export class CartLink {
  protected readonly shoppingBasketIcon = shoppingBasketIcon;
  /** Which of the two navbars is drawing this control. */
  readonly variant = input<NavVariant>('bar');
  protected readonly cls = computed(() => navActionClasses(this.variant()));

  /** The stylesheet hides `cart-label` once there is a figure. */
  protected readonly labelClass = computed(() =>
    this.variant() === 'bar'
      ? `cart-label ${this.cls().label}`
      : this.cls().label,
  );

  private readonly cart = inject(CartService);
  private readonly path = currentPath();

  /** From the URL: `routerLinkActive` sets `aria-current` a frame late. */
  protected readonly active = computed(() => this.path() === '/cart');
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly text = inject(STOREFRONT_TEXT).cart;

  /** False on the server, which has no cart to read. */
  protected readonly ready = this.isBrowser;

  protected readonly count = this.cart.count;

  /** One sentence with the exact total: a badge alone says nothing when read.
   * */
  protected readonly summary = computed(() =>
    fillText(this.text.summaryAria, {
      count: this.count(),
      total: formatMoneyMinor(this.cart.totalMinor(), this.currency),
    }),
  );
}
