import { CanDeactivateFn } from '@angular/router';

import { confirmDiscard } from './confirm-discard';

export interface UnsavedChangesAware {
  hasUnsavedChanges(): boolean;
}

/** Confirms before a navigation drops unsaved edits, in the editor's words.
 * `message` runs in the guard's injection context, so it injects its text. */
export function unsavedChangesGuard(
  message: () => string,
): CanDeactivateFn<UnsavedChangesAware> {
  return (component) => {
    if (!component.hasUnsavedChanges()) {
      return true;
    }
    return confirmDiscard(message());
  };
}
