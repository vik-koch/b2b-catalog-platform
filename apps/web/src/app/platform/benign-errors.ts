import { ErrorHandler, Injectable } from '@angular/core';

/** "ResizeObserver loop completed with undelivered notifications": a
 * spec-conformant notice that an observation moved to the next frame, which
 * `provideBrowserGlobalErrorListeners` would report as an app failure. */
const RESIZE_OBSERVER_LOOP = 'ResizeObserver loop';

/** Angular's handler minus that one message; anything else is real. */
@Injectable()
export class BenignErrorFilter extends ErrorHandler {
  override handleError(error: unknown): void {
    // Wrapped in dev, the browser's own in production; both carry the text.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(RESIZE_OBSERVER_LOOP)) return;
    super.handleError(error);
  }
}
