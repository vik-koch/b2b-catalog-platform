import { inject } from '@angular/core';
import { ADMIN_TEXT } from '../shared/config/admin-text';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';

/**
 * The one discard-unsaved-changes prompt, shared by the editors' Cancel buttons
 * and the canDeactivate guards. Only the message differs per editor; the
 * heading and the two labels are the admin text's `discard`.
 *
 * Must be called in an injection context — a guard body, or a component field
 * initialiser, which is what `injectConfirmDiscard` is for.
 */
export function confirmDiscard(message: string): Promise<boolean> {
  return injectConfirmDiscard()(message);
}

/** `confirmDiscard` bound to the current injector, callable later. */
export function injectConfirmDiscard(): (message: string) => Promise<boolean> {
  const text = inject(ADMIN_TEXT).discard;
  const confirm = inject(ConfirmService);
  return (message) =>
    confirm.ask({
      heading: text.heading,
      message,
      confirmLabel: text.confirm,
      cancelLabel: text.cancel,
    });
}
