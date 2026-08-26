import { isPlatformBrowser } from '@angular/common';
import {
  effect,
  inject,
  Injectable,
  PLATFORM_ID,
  untracked,
} from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { CartPreviewService } from './cart-preview.service';
import { CartService } from './cart.service';

/**
 * Prices the cart again when the visitor changes (FR-CART-10).
 *
 * Prices are tiered, so the figures written down belong to whoever was signed
 * in when they were quoted. Without this the header would carry a guest's
 * total around a signed-in session until the customer happened to open
 * `/cart` — the one page that prices anything — and the correction would then
 * land in front of them as if something had happened to their cart.
 *
 * It runs on the *identity*, not on the page: signing in, signing out, and a
 * session the browser resolves on load that the stored prices were not quoted
 * to. `CartService` treats the answer as a silent re-baseline, so nothing is
 * reported for it.
 *
 * A failure is dropped. The stored prices stand, exactly as they do when the
 * cart page cannot reach the server, and the next pricing call tries again.
 */
@Injectable({ providedIn: 'root' })
export class CartRepricing {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly cart = inject(CartService);
  private readonly pricing = inject(CartPreviewService);
  private readonly auth = inject(AuthService);

  /** One call at a time: the effect can fire again while an answer is on its
   * way, and the later answer would describe the same cart. */
  private inFlight = false;

  constructor() {
    if (!this.isBrowser) return;
    effect(() => {
      // The dependencies: who is signed in, and whether that is an answer yet.
      // `user()` alone folds "not known" into "signed out", which would price
      // a signed-in cart as a guest's on every load.
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
      // Left as it was — see the class comment.
    } finally {
      this.inFlight = false;
    }
  }
}
