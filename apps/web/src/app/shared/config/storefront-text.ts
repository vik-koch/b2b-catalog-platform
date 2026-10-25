import { InjectionToken, Provider } from '@angular/core';
import { StorefrontText } from './storefront-text.type';
import { readShellState } from './shell-state';

export const STOREFRONT_TEXT = new InjectionToken<StorefrontText>(
  'STOREFRONT_TEXT',
);

/**
 * Browser provider: reads the text the server injected into the document (see
 * shell-state.ts). No baked fallback — a missing payload is a bug, surfaced
 * loudly rather than rendered as empty chrome.
 */
export function provideStorefrontText(): Provider {
  return {
    provide: STOREFRONT_TEXT,
    useFactory: () => readShellState('storefrontText'),
  };
}
