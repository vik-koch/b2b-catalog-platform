import { Provider } from '@angular/core';
import { STOREFRONT_TEXT } from './storefront-text';
import { StorefrontText, storefrontTextSchema } from './storefront-text.type';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

/**
 * Read once per process: the mounted file is immutable for the container's
 * lifetime, so there's no reason to re-read and re-validate on every SSR
 * request. A bad file throws here, at first render, and keeps the stack down.
 *
 * Constructed lazily because the production build imports this module
 * without any runtime environment.
 */
let cachedStorefrontText: StorefrontText | undefined;

/** The validated catalog. Also the source for the injected shell state. */
export function getStorefrontText(): StorefrontText {
  return (cachedStorefrontText ??= loadConfig(
    storefrontTextSchema,
    'texts/storefront.json',
  ));
}

/**
 * Load and validate the app text eagerly. Called from the Node entry
 * point at startup so a missing/invalid file fails the boot rather than
 * surfacing on the first SSR render. Safe to call before any render:
 * it only populates the cache the provider factory reuses.
 */
export function preloadStorefrontText(): void {
  getStorefrontText();
}

/**
 * Server provider: hands the render the text straight from the mounted file.
 * Merged after appConfig, so it wins over the browser provider during SSR —
 * which reads the document, and there is none on the server. Delivery to the
 * browser is separate, and the same for every route (see shell-state.server.ts).
 */
export function provideServerStorefrontText(): Provider {
  return { provide: STOREFRONT_TEXT, useFactory: getStorefrontText };
}
