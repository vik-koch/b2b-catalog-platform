import { isPlatformBrowser } from '@angular/common';
import {
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { AuthService } from '../../../platform/auth/auth.service';
import { CartPreviewService } from './cart-preview.service';
import { CartService } from './cart.service';

/** Re-prices the cart when the visitor changes (FR-CART-10): prices are tiered,
 * and otherwise the header would show a guest's total to a signed-in customer
 * until `/cart` corrected it as news. `CartService` takes the answer as a
 * silent re-baseline. A failure leaves the stored prices. */
@Injectable({ providedIn: 'root' })
export class CartRepricing {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cart = inject(CartService);
  private readonly pricing = inject(CartPreviewService);
  private readonly auth = inject(AuthService);

  /** One call at a time: a second would describe the same cart. */
  private inFlight = false;

  constructor() {
    if (!this.isBrowser) return;
    effect(() => {
      // `user()` alone reads "not known" as signed out and would price a
      // signed-in cart as a guest's on every load.
      this.auth.user();
      if (!this.auth.resolved()) return;
      untracked(() => void this.reprice());
    });
  }

  private async reprice(): Promise<void> {
    if (this.inFlight || !this.cart.needsRepricing()) return;
    const lines = this.cart.request();
    this.inFlight = true;
    try {
      this.cart.applyPreview(await this.pricing.preview(lines));
    } catch {
      // Left as it was.
    } finally {
      this.inFlight = false;
    }
  }
}
