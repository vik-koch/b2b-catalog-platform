import { inject } from '@angular/core';
import { ADMIN_TEXT } from '../config/admin-text';
import { ConfirmService } from '../ui/confirm.service';

/**
 * The one discard-unsaved-changes prompt, shared by the editors' Cancel buttons
 * and the canDeactivate guards. Only the message differs per editor; the
 * heading and the two labels are common admin wording.
 *
 * Must be called in an injection context — a guard body, or a component field
 * initialiser, which is what `injectConfirmDiscard` is for.
 */
export function confirmDiscard(message: string): Promise<boolean> {
  return injectConfirmDiscard()(message);
}

/** `confirmDiscard` bound to the current injector, callable later. */
export function injectConfirmDiscard(): (message: string) => Promise<boolean> {
  const common = inject(ADMIN_TEXT).common;
  const confirm = inject(ConfirmService);
  return (message) =>
    confirm.ask({
      heading: common.discardTitle,
      message,
      confirmLabel: common.discard,
      cancelLabel: common.keepEditing,
    });
}
