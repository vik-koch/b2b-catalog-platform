import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ADMIN_TEXT } from '../config/admin-text';
import { UnsavedChangesAware } from '../pages/unsaved-changes.guard';

/** Confirms before a navigation drops unsaved category edits (FR-ADM-01). */
export const categoryUnsavedChangesGuard: CanDeactivateFn<
  UnsavedChangesAware
> = (component) => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }
  return window.confirm(inject(ADMIN_TEXT).categories.discardConfirm);
};
