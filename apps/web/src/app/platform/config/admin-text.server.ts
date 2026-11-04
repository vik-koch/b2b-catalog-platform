import { Provider } from '@angular/core';
import { ADMIN_TEXT } from './admin-text';
import { adminTextSchema } from './admin-text.type';
import { mountedFile } from './mounted-file.server';

export const getAdminText = mountedFile(adminTextSchema, 'texts/admin.json');

/** At boot, so an untranslated new key stops the start, not an editor later. */
export function preloadAdminText(): void {
  getAdminText();
}

/** The always-mounted edit-mode toggle injects the token on the server too,
 * though nothing admin is rendered there. */
export function provideServerAdminText(): Provider {
  return { provide: ADMIN_TEXT, useFactory: getAdminText };
}
