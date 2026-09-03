import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ADMIN_TEXT } from '../config/admin-text';
import type { AdminText } from '../config/admin-text.type';
import { confirmDiscard } from './confirm-discard';

export interface UnsavedChangesAware {
  hasUnsavedChanges(): boolean;
}

/**
 * Confirms before a navigation drops unsaved edits. Every editor asks the same
 * question about its own kind of record, so the guard is given the wording to
 * ask it with rather than existing once per editor.
 */
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
