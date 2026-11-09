import { InjectionToken, Provider } from '@angular/core';

import { readShellState } from './shell-state';
import { StorefrontText } from './storefront-text.type';

export const STOREFRONT_TEXT = new InjectionToken<StorefrontText>(
  'STOREFRONT_TEXT',
);

/** In the browser, from the document (see shell-state.ts). */
export function provideStorefrontText(): Provider {
  return {
    provide: STOREFRONT_TEXT,
    useFactory: () => readShellState('storefrontText'),
  };
}

/** An area's block of the storefront text. Typed apart, but the server checks
 * the file whole against every area's shape, so the block is always there. */
export function storefrontTextBlock<T>(text: StorefrontText, area: string): T {
  return (text as unknown as Record<string, T>)[area];
}
