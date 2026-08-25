import { Injectable } from '@angular/core';
import { cartContract, CartLine } from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

/**
 * Prices the browser's cart (`POST /cart/preview`). Separate from
 * `CartService`, which is the store: the store must keep working — and keep
 * showing its last-seen prices — whether or not this answers.
 *
 * There is no `deferSessionReads()` guard here. The route it serves is
 * client-rendered, so the server never calls it; the request also depends on
 * localStorage, which SSR cannot read at all.
 */
@Injectable({ providedIn: 'root' })
export class CartPreviewService {
  private readonly client = createApiClient(cartContract);

  async preview(lines: CartLine[]) {
    const response = await this.client.previewCart({ body: { lines } });
    if (response.status === 200) return response.body;
    throw new Error(`Failed to price the cart (status ${response.status})`);
  }
}
