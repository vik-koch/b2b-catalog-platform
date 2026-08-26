/**
 * Where the cart lives in the browser, named in one place because three
 * readers share it: the CartService, the specs, and the pre-paint script that
 * fills the navbar before Angular has booted (cart-shell.server.ts).
 */
export const CART_STORAGE_KEY = 'cart';

/**
 * Bump when a stored cart can no longer be read by this code. A mismatch is
 * discarded rather than migrated: a cart is cheap to rebuild, and a
 * half-understood one would price wrongly.
 */
export const CART_STORAGE_VERSION = 1;
