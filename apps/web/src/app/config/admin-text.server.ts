import { Provider } from '@angular/core';
import { ADMIN_TEXT } from './admin-text';
import { AdminText, adminTextSchema } from './admin-text.type';
import { loadConfig } from '@b2b-catalog-platform/shared/node';

const ADMIN_TEXT_ENV_VAR = 'ADMIN_TEXT_FILE';

/**
 * Read once per process, like the public text: the mounted file is immutable
 * for the container's lifetime. A bad file throws here and keeps the stack
 * down. Constructed lazily because the production build imports this module
 * without any runtime environment.
 */
let cachedAdminText: AdminText | undefined;

export function getAdminText(): AdminText {
  return (cachedAdminText ??= loadConfig(adminTextSchema, ADMIN_TEXT_ENV_VAR));
}

/**
 * Validate the admin text at boot rather than on the first admin request —
 * a deployment that forgot to translate a new key should fail to start, not
 * fail hours later when someone opens an editor.
 */
export function preloadAdminText(): void {
  getAdminText();
}

/**
 * Server provider: the render reads the mounted file directly, so SSR never
 * depends on the fetch the browser uses. Components that merely *inject* the
 * token — the always-mounted edit-mode toggle — must resolve on the server too,
 * even though nothing admin is ever rendered there: the server resolves no
 * session (0019), so every admin affordance stays hidden and no admin wording
 * reaches the document.
 */
export function provideServerAdminText(): Provider {
  return { provide: ADMIN_TEXT, useFactory: getAdminText };
}
