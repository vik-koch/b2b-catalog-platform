/** The storage key, shared by CartService, the specs and the pre-paint script
 * (cart-shell.server.ts). */
export const CART_STORAGE_KEY = 'cart';

/** Bump when a stored cart can no longer be read. A mismatch is discarded, not
 * migrated. */
export const CART_STORAGE_VERSION = 2;
