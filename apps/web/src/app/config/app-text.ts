import { InjectionToken, Provider } from '@angular/core';
import { AppText } from './app-text.type';
import { readShellState } from './shell-state';

export const APP_TEXT = new InjectionToken<AppText>('APP_TEXT');

/**
 * Browser provider: reads the text the server injected into the document (see
 * shell-state.ts). No baked fallback — a missing payload is a bug, surfaced
 * loudly rather than rendered as empty chrome.
 */
export function provideAppText(): Provider {
  return {
    provide: APP_TEXT,
    useFactory: () => readShellState('appText'),
  };
}
