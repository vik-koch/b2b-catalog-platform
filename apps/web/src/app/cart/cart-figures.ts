import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { formatPriceMinorShort } from '../catalog/price';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { CartService } from './cart.service';

/**
 * Keeps the navbar cart's figures — the line count and the running total — on
 * `<html>` as custom properties, which is where the stylesheet draws them from
 * (see styles.css).
 *
 * They are not in any template because they have to be on screen before
 * Angular exists: the server cannot read the localStorage the cart lives in,
 * so anything it rendered would be an empty cart corrected a beat later. The
 * inline script in cart-shell.server.ts sets them before the first paint and
 * this sets the same ones for the rest of the visit, so the two pictures are
 * the same one.
 *
 * A service rather than part of the control that shows them: the storefront
 * draws that control twice — the header's row and the bottom bar — and only
 * one of the two is ever on screen. The shell starts this once instead.
 */
@Injectable({ providedIn: 'root' })
export class CartFigures {
  private readonly cart = inject(CartService);
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  private readonly root = inject(DOCUMENT).documentElement;

  constructor() {
    // Nothing to write on the server: it has no localStorage to read a cart
    // from, so the document it renders is the empty-cart one for everybody.
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect(() => this.write());
  }

  private write(): void {
    const count = this.cart.count();
    if (count === 0) {
      this.root.classList.remove('cart-filled');
      this.root.style.removeProperty('--cart-count');
      this.root.style.removeProperty('--cart-total');
      return;
    }
    // JSON quoting, because `content` takes a CSS string and the total carries
    // spaces and a currency sign.
    const total = formatPriceMinorShort(this.cart.totalMinor(), this.currency);
    this.root.style.setProperty('--cart-count', JSON.stringify(String(count)));
    this.root.style.setProperty('--cart-total', JSON.stringify(total));
    this.root.classList.add('cart-filled');
  }
}
