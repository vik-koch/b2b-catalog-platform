import { inject } from '@angular/core';

import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';

import { ADMIN_TEXT } from '../../platform/config/admin-text';

/** The discard-changes prompt for an editor's Cancel and its guard; only the
 * message differs. Call in an injection context. */
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
