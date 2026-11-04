import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ADMIN_TEXT } from '../../platform/config/admin-text';
import type { AdminText } from '../../platform/config/admin-text.type';
import { confirmDiscard } from './confirm-discard';

export interface UnsavedChangesAware {
  hasUnsavedChanges(): boolean;
}

/** Confirms before a navigation drops unsaved edits, in the editor's words. */
export function unsavedChangesGuard(
  message: (text: AdminText) => string,
): CanDeactivateFn<UnsavedChangesAware> {
  return (component) => {
    if (!component.hasUnsavedChanges()) {
      return true;
    }
    return confirmDiscard(message(inject(ADMIN_TEXT)));
  };
}
