import { Component, inject, input, RESPONSE_INIT } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { PageTitle } from '../../shared/ui/page-title';
import { PageIntro } from '../../shared/ui/page-intro';

/**
 * The one 404 screen: the "404" eyebrow, a heading, an explanation and a way
 * back. Used by the catch-all route and by the resource-level misses (unknown
 * product / category slug), which differ only in their wording and back link.
 *
 * It also owns the response status, so every one of those cases sends crawlers
 * a real 404 rather than a styled 200.
 */
@Component({
  selector: 'app-not-found-view',
  imports: [RouterLink, Button, PageTitle, PageIntro],
  template: `
    <section class="py-12 text-center sm:py-20">
      <p class="text-sm font-medium tracking-widest text-accent">404</p>
      <h1 appPageTitle class="mt-3">
        {{ heading() ?? text.notFoundTitle }}
      </h1>
      <p appPageIntro class="mt-4">{{ body() ?? text.notFoundBody }}</p>
      <a appButton variant="secondary" [routerLink]="backLink()" class="mt-8">
        {{ backLabel() ?? text.notFoundBack }}
      </a>
    </section>
  `,
})
export class NotFoundView {
  protected readonly text = inject(STOREFRONT_TEXT).errors;

  readonly heading = input<string | null>(null);
  readonly body = input<string | null>(null);
  readonly backLink = input<string>('/');
  readonly backLabel = input<string | null>(null);

  constructor() {
    // The token only exists during SSR; it is null in the browser and on
    // client-side navigations, where the status line has already been sent.
    const responseInit = inject(RESPONSE_INIT, { optional: true });
    if (responseInit) {
      responseInit.status = 404;
    }
  }
}
