import { isPlatformBrowser } from '@angular/common';
import { Component, computed, inject, input, PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  moneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared';
import { CartService } from '../../shared/cart/cart.service';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { currentUrl } from '../../shared/core/current-url';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { navActionClasses, NavVariant } from './nav-action';
import { shoppingBasketIcon } from '@b2b-catalog-platform/ui/icons/glyphs/shopping-basket';

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
 *
 * The bottom bar shows no total. Its tabs are a fifth of a phone's width and
 * their captions are for screen readers only, so the badge is the whole of
 * what a glance needs there; the figure is one tap away on the cart itself,
 * and the spoken label carries it either way.
 */
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
      <!-- inline-flex, not the default inline box: an inline wrapper adds the
           line's descender space under the glyph and pushes the icon off the
           row's centre. -->
      <span class="relative inline-flex">
        <ui-icon [glyph]="shoppingBasketIcon" class="size-6" />
        <!-- The account's waiting-work dot, because a filled cart is work too:
             an order the customer has still to place or drop. The white
             figure on it is 3.2:1, short of the 4.5:1 text wants; dark digits
             passed but read as a foreign colour in the header, and a darker
             dot would no longer be the same dot. -->
        <span
          aria-hidden="true"
          class="cart-count absolute -top-0.75 -right-2 h-3 min-w-3
                 items-center justify-center rounded-full bg-warning-dot p-0.5
                 text-[0.625rem]/3 text-white font-normal transition-colors"
        ></span>
      </span>
      <span [class]="cls().labelRow">
        <!-- The total takes the label's place once there is one, as a chip: it
             is a figure rather than a caption, and a chip stops it reading as
             one more nav word. Its negative side margins let it claim the
             control's own 12px paddings, so it has the full 72px of the
             control to itself before anything in the navbar moves — and past
             that the control grows with it rather than spilling over its
             neighbours. It follows the control's own hover and press colours,
             so the whole button still reads as one thing. -->
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

  /** Only the header's caption steps aside for the total — `cart-label` is
   * what the stylesheet hides once there is a figure to put in its place. */
  protected readonly labelClass = computed(() =>
    this.variant() === 'bar'
      ? `cart-label ${this.cls().label}`
      : this.cls().label,
  );

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
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly text = inject(STOREFRONT_TEXT).cart;

  /** False on the server, where there is no cart to read and any figure
   * announced would be one the visitor's own browser is about to replace. */
  protected readonly ready = this.isBrowser;

  protected readonly count = this.cart.count;

  /** One sentence, because a badge read on its own says nothing — and with the
   * exact total, since a spoken label costs the navbar no width. */
  protected readonly summary = computed(() =>
    fillText(this.text.summaryAria, {
      count: this.count(),
      total: formatMoneyMinor(this.cart.totalMinor(), this.currency),
    }),
  );
}
