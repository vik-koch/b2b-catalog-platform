import { PricedCart } from './cart-pricing';

/**
 * A cart the server priced differently from what the browser last saw. Carries
 * the fresh preview, so the controller can answer the refusal with the
 * corrected cart rather than telling the customer to try again.
 */
export class CartChangedException extends Error {
  constructor(readonly priced: PricedCart) {
    super('The cart changed while it was being submitted');
  }
}
