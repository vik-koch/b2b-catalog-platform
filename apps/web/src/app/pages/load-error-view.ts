import { Component, inject, input, RESPONSE_INIT } from '@angular/core';
import { APP_TEXT } from '../config/app-text';

/**
 * Shown when a page's data could not be loaded — the API is down, or answered
 * something the client cannot use. The sibling of NotFoundView, and it exists
 * for the same reason: something has to own the response status.
 *
 * Without it these branches rendered an apology inside a **200**. That is wrong
 * twice over: a crawler is invited to index the error page as if it were the
 * content, and every status-based monitor — including the Traefik access logs
 * that are this platform's request-level signal (ADR 0016) — reports the site
 * healthy while it is broken. 503 says "temporarily unavailable, come back",
 * which is both true and the thing that makes an outage visible.
 */
@Component({
  selector: 'app-load-error-view',
  template: `
    @if (heading()) {
      <h1 class="text-3xl font-bold tracking-tight">{{ heading() }}</h1>
      <p class="mt-4 text-muted">{{ message() ?? text.cannotLoadBody }}</p>
    } @else {
      <p class="text-muted">{{ message() ?? text.cannotLoadBody }}</p>
    }
  `,
})
export class LoadErrorView {
  protected readonly text = inject(APP_TEXT).errors;

  /** Set to render a full page-level error; omit for an inline one. */
  readonly heading = input<string | null>(null);
  readonly message = input<string | null>(null);

  constructor() {
    // Only present during SSR; null in the browser and on client-side
    // navigations, where the status line has already gone out.
    const responseInit = inject(RESPONSE_INIT, { optional: true });
    if (responseInit) {
      responseInit.status = 503;
    }
  }
}
