import { Component, inject, RESPONSE_INIT } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';

@Component({
  imports: [RouterLink, Button],
  selector: 'app-not-found',
  template: `
    <section class="py-12 text-center sm:py-20">
      <p class="text-sm font-medium tracking-widest text-accent">404</p>
      <h1 class="mt-3 text-3xl font-bold tracking-tight">
        {{ text.notFoundTitle }}
      </h1>
      <p class="mt-4 text-stone-600">{{ text.notFoundBody }}</p>
      <a appButton variant="secondary" routerLink="/" class="mt-8">
        {{ text.notFoundBack }}
      </a>
    </section>
  `,
})
export class NotFound {
  protected readonly text = inject(APP_TEXT).errors;

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
