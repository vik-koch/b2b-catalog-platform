import { Injectable } from '@angular/core';
import { CartLine } from '@b2b-catalog-platform/shared/core/ordering';
import { cartContract } from '../contract-routes.generated';
import { createOrpcClient } from '../../../platform/orpc-client';

/** Prices the browser's cart (`POST /cart/preview`), apart from `CartService`
 * so the store works whether or not this answers. Never called on the server:
 * SSR cannot read localStorage. */
@Injectable({ providedIn: 'root' })
export class CartPreviewService {
  private readonly client = createOrpcClient(cartContract);

  preview(lines: CartLine[]) {
    return this.client.previewCart({ body: { lines } });
  }
}
