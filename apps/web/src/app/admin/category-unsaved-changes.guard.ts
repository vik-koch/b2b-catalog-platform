import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { UnsavedChangesAware } from '../pages/unsaved-changes.guard';

/** Confirms before a navigation drops unsaved category edits (FR-ADM-01). */
export const categoryUnsavedChangesGuard: CanDeactivateFn<
  UnsavedChangesAware
> = (component) => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }
  return window.confirm(inject(APP_TEXT).adminCategories.discardConfirm);
};
