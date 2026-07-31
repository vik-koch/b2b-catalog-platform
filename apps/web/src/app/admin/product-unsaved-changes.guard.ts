import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ADMIN_TEXT } from '../config/admin-text';
import { confirmDiscard } from './confirm-discard';
import { UnsavedChangesAware } from '../pages/unsaved-changes.guard';

/** Confirms before a navigation drops unsaved product edits (FR-ADM-01). */
export const productUnsavedChangesGuard: CanDeactivateFn<
  UnsavedChangesAware
> = (component) => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }
  return confirmDiscard(inject(ADMIN_TEXT).productEditor.discardConfirm);
};
