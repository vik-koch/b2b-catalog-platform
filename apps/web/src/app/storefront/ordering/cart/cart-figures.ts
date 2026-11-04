import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { effect, inject, Injectable, PLATFORM_ID } from '@angular/core';
import { formatPriceMinorShort } from '../../../core/catalog/pricing/price';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { CartService } from './cart.service';
import { moneyFormat } from '@b2b-catalog-platform/shared/platform';

/** Keeps the navbar cart's figures on `<html>` as custom properties for
 * styles.css: the server cannot read localStorage, so the pre-paint script in
 * cart-shell.server.ts sets them first and this keeps them. A service, as the
 * control is drawn twice (header and bottom bar). */
@Injectable({ providedIn: 'root' })
export class CartFigures {
  private readonly cart = inject(CartService);
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));
  private readonly root = inject(DOCUMENT).documentElement;

  constructor() {
    // The server renders the empty cart for everybody.
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
    // JSON quoting: `content` takes a CSS string with spaces and a currency
    // sign.
    const total = formatPriceMinorShort(this.cart.totalMinor(), this.currency);
    this.root.style.setProperty('--cart-count', JSON.stringify(String(count)));
    this.root.style.setProperty('--cart-total', JSON.stringify(total));
    this.root.classList.add('cart-filled');
  }
}
