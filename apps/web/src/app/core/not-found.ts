import { Component, inject, RESPONSE_INIT } from '@angular/core';

@Component({
  selector: 'app-not-found',
  template: `<h1>404 — Page not found</h1>`,
})
export class NotFound {
  constructor() {
    // Crawlers must receive a real 404 status, not a styled 200. The token
    // only exists during SSR; it is null in the browser and on client-side
    // navigations, where the status line has already been sent.
    const responseInit = inject(RESPONSE_INIT, { optional: true });
    if (responseInit) {
      responseInit.status = 404;
    }
  }
}
