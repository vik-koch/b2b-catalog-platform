import { Injectable } from '@angular/core';
import { CartLine } from '@b2b-catalog-platform/shared';
import { cartContract } from '../core/contract-routes.generated';
import { createOrpcClient } from '../core/orpc-client';

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
  private readonly client = createOrpcClient(cartContract);

  preview(lines: CartLine[]) {
    return this.client.previewCart({ body: { lines } });
  }
}
