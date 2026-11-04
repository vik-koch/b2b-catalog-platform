import { InjectionToken, Provider } from '@angular/core';
import { StorefrontText } from './storefront-text.type';
import { readShellState } from './shell-state';

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
