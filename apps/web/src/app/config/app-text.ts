import {
  inject,
  InjectionToken,
  makeStateKey,
  Provider,
  TransferState,
} from '@angular/core';
import { AppText } from './app-text.type';

export const APP_TEXT = new InjectionToken<AppText>('APP_TEXT');

export const APP_TEXT_STATE_KEY = makeStateKey<AppText>('appText');

/**
 * Browser provider: reads the text the server serialized into the HTML. No
 * baked fallback. SSR always writes the state, so a missing key is a bug,
 * surfaced loudly rather than rendered as empty chrome.
 */
export function provideAppText(): Provider {
  return {
    provide: APP_TEXT,
    useFactory: () => {
      const state = inject(TransferState);
      if (!state.hasKey(APP_TEXT_STATE_KEY)) {
        throw new Error('AppText missing from TransferState');
      }
      return state.get(APP_TEXT_STATE_KEY, null as never);
    },
  };
}
