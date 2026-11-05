import { Provider } from '@angular/core';
import { sharedTextSchema } from '@b2b-catalog-platform/shared/deployment';
import { ADMIN_TEXT } from './platform/config/admin-text';
import { mountedFile } from './platform/config/mounted-file.server';
import { SHARED_TEXT } from './platform/config/shared-text';
import { STOREFRONT_TEXT } from './platform/config/storefront-text';
import { adminTextSchema, storefrontTextSchema } from './app.texts';

export const getStorefrontText = mountedFile(
  storefrontTextSchema,
  'texts/storefront.json',
);

export const getAdminText = mountedFile(adminTextSchema, 'texts/admin.json');

export const getSharedText = mountedFile(sharedTextSchema, 'texts/shared.json');

/** At boot, so a bad or untranslated file stops the start, not a render. */
export function preloadTexts(): void {
  getStorefrontText();
  getAdminText();
  getSharedText();
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
    { provide: SHARED_TEXT, useFactory: getSharedText },
  ];
}
