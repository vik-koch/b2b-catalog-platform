import { Provider } from '@angular/core';
import { ADMIN_TEXT } from './platform/config/admin-text';
import { mountedFile } from './platform/config/mounted-file.server';
import { STOREFRONT_TEXT } from './platform/config/storefront-text';
import { adminTextSchema, storefrontTextSchema } from './app.texts';

export const getStorefrontText = mountedFile(
  storefrontTextSchema,
  'texts/storefront.json',
);

export const getAdminText = mountedFile(adminTextSchema, 'texts/admin.json');

/** At boot, so a bad or untranslated file stops the start, not a render. */
export function preloadTexts(): void {
  getStorefrontText();
  getAdminText();
}

/**
 * Merged after appConfig, so the render reads the files, not the document.
 * The always-mounted edit-mode toggle injects the admin text on the server
 * too, though nothing admin is rendered there.
 */
export function provideServerTexts(): Provider[] {
  return [
    { provide: STOREFRONT_TEXT, useFactory: getStorefrontText },
    { provide: ADMIN_TEXT, useFactory: getAdminText },
  ];
}
