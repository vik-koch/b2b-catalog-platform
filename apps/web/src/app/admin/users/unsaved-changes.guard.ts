import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { confirmDiscard } from '../confirm-discard';
import { UnsavedChangesAware } from '../../core/unsaved-changes.guard';

/** Confirms before a navigation drops unsaved account edits (FR-AUTH-04). */
export const userUnsavedChangesGuard: CanDeactivateFn<UnsavedChangesAware> = (
  component,
) => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }
  return confirmDiscard(inject(ADMIN_TEXT).userEditor.discardConfirm);
};
