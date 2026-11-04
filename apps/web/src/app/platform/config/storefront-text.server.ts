import { Provider } from '@angular/core';
import { mountedFile } from './mounted-file.server';
import { STOREFRONT_TEXT } from './storefront-text';
import { storefrontTextSchema } from './storefront-text.type';

export const getStorefrontText = mountedFile(
  storefrontTextSchema,
  'texts/storefront.json',
);

/** At boot, so a bad file stops the start rather than the first render. */
export function preloadStorefrontText(): void {
  getStorefrontText();
}

/** Merged after appConfig, so the render reads the file, not the document. */
export function provideServerStorefrontText(): Provider {
  return { provide: STOREFRONT_TEXT, useFactory: getStorefrontText };
}
