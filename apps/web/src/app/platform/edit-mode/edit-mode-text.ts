import { computed, inject, InjectionToken, Signal } from '@angular/core';

import { ADMIN_TEXT, adminText, loadAdminText } from '../config/admin-text';
import type { AdminText } from '../config/admin-text.type';

/** Edit mode's words, for what renders only once the admin text is here, such
 * as a section deferred on edit mode. */
export const EDIT_MODE_TEXT = new InjectionToken<AdminText['editMode']>(
  'EDIT_MODE_TEXT',
  { providedIn: 'root', factory: () => inject(ADMIN_TEXT).editMode },
);

/** The same words for an eager page: null until the admin text arrives. */
export const editModeText: Signal<AdminText['editMode'] | null> = computed(
  () => adminText()?.editMode ?? null,
);

/** Fetches the admin text for a page that has to show staff these words. */
export const loadEditModeText = loadAdminText;
