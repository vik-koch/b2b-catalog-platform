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

/** An area's part of the storefront text. Typed apart, but the server checks
 * the file whole against every area's shape, so the part is always there. */
export function storefrontTextPart<T>(text: StorefrontText): T {
  return text as unknown as T;
}
