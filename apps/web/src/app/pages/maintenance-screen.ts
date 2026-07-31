import { Component, inject, RESPONSE_INIT } from '@angular/core';
import { APP_TEXT } from '../config/app-text';

/**
 * The public notice shown while maintenance mode is on (FR-ADM-04). Reached by
 * the maintenance gate redirect. Deliberately self-contained — it fetches no
 * catalog data (which the API would 503 anyway), so it renders cleanly behind
 * the gate.
 */
@Component({
  selector: 'app-maintenance-screen',
  imports: [],
  template: `
    <section class="py-12 text-center sm:py-20">
      <h1 class="mt-3 text-3xl font-bold tracking-tight">{{ text.title }}</h1>
      <p class="mx-auto mt-4 max-w-prose text-muted">{{ text.body }}</p>
    </section>
  `,
})
export class MaintenanceScreen {
  protected readonly text = inject(APP_TEXT).maintenance;

  constructor() {
    // Crawlers must receive a real 503 (temporary), never a styled 200 that
    // would invite indexing of the placeholder. The token only exists during
    // SSR; it is null in the browser and on client-side navigations.
    const responseInit = inject(RESPONSE_INIT, { optional: true });
    if (responseInit) {
      responseInit.status = 503;
    }
  }
}
