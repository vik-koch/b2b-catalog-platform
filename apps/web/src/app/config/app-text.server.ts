import { inject, Provider, TransferState } from '@angular/core';
import { APP_TEXT, APP_TEXT_STATE_KEY, defaultAppText } from './app-text';

/**
 * Server provider: serializes the UI text into TransferState so the browser
 * reads it once from the initial HTML instead of over an endpoint. Merged after
 * appConfig, so it wins over the browser provider during SSR.
 */
export function provideServerAppText(): Provider {
  return {
    provide: APP_TEXT,
    useFactory: () => {
      const text = defaultAppText;
      inject(TransferState).set(APP_TEXT_STATE_KEY, text);
      return text;
    },
  };
}
