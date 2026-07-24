import { inject, Provider, TransferState } from '@angular/core';
import { APP_TEXT, APP_TEXT_STATE_KEY } from './app-text';
import { appTextSchema } from './app-text.type';
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
let cachedAppText: ReturnType<typeof loadConfig> | undefined;

function getAppText() {
  return (cachedAppText ??= loadConfig(appTextSchema, APP_TEXT_ENV_VAR));
}

/**
 * Server provider: serializes the UI text into TransferState so the browser
 * reads it once from the initial HTML instead of over an endpoint. Merged after
 * appConfig, so it wins over the browser provider during SSR.
 */
export function provideServerAppText(): Provider {
  return {
    provide: APP_TEXT,
    useFactory: () => {
      const appText = getAppText();
      inject(TransferState).set(APP_TEXT_STATE_KEY, appText);
      return appText;
    },
  };
}
