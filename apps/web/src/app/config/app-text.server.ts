import { Provider } from '@angular/core';
import { APP_TEXT } from './app-text';
import { AppText, appTextSchema } from './app-text.type';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

const APP_TEXT_ENV_VAR = 'APP_TEXT_FILE';

/**
 * Read once per process: the mounted file is immutable for the container's
 * lifetime, so there's no reason to re-read and re-validate on every SSR
 * request. A bad file throws here, at first render, and keeps the stack down.
 *
 * Constructed lazily because the production build imports this module
 * without any runtime environment.
 */
let cachedAppText: AppText | undefined;

/** The validated catalog. Also the source for the injected shell state. */
export function getAppText(): AppText {
  return (cachedAppText ??= loadConfig(appTextSchema, APP_TEXT_ENV_VAR));
}

/**
 * Load and validate the app text eagerly. Called from the Node entry
 * point at startup so a missing/invalid file fails the boot rather than
 * surfacing on the first SSR render. Safe to call before any render:
 * it only populates the cache the provider factory reuses.
 */
export function preloadAppText(): void {
  getAppText();
}

/**
 * Server provider: hands the render the text straight from the mounted file.
 * Merged after appConfig, so it wins over the browser provider during SSR —
 * which reads the document, and there is none on the server. Delivery to the
 * browser is separate, and the same for every route (see shell-state.server.ts).
 */
export function provideServerAppText(): Provider {
  return { provide: APP_TEXT, useFactory: getAppText };
}
