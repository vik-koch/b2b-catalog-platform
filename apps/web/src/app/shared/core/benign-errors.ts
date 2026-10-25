import { ErrorHandler, Injectable } from '@angular/core';

/**
 * "ResizeObserver loop completed with undelivered notifications."
 *
 * Not an error, and not ours to fix: the browser fires it as a window `error`
 * event whenever a resize callback changes a size, which defers that
 * observation to the next frame instead of the current one. The spec says so
 * and every browser does it — nothing is broken and no notification is lost.
 *
 * It only reaches the console because `provideBrowserGlobalErrorListeners`
 * hands window errors to the ErrorHandler, where it arrives as an ErrorEvent
 * carrying no `error` object. Angular re-wraps it, so it is reported as an
 * application failure with a stack pointing at Angular's own listener — the
 * shape of a real bug and none of the substance.
 */
const RESIZE_OBSERVER_LOOP = 'ResizeObserver loop';

/**
 * The app's error handler: Angular's own, minus the browser noise above.
 *
 * Deliberately one named message rather than a filter list. Anything else
 * reaching here is a real failure and still belongs in the console.
 */
@Injectable()
export class BenignErrorFilter extends ErrorHandler {
  override handleError(error: unknown): void {
    // The message is the wrapped one in dev and the browser's own in a
    // production build; both carry the text.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(RESIZE_OBSERVER_LOOP)) return;
    super.handleError(error);
  }
}
