import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../platform/config/storefront-text';
import { setResponseStatus } from './response-status';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';

/** The one 404 screen, for the catch-all route and an unknown slug alike, and
 * a real 404 status rather than a styled 200. */
@Component({
  selector: 'app-not-found-view',
  imports: [RouterLink, Button, PageTitle, PageIntro],
  template: `
    <section class="py-12 text-center sm:py-20">
      <p class="text-sm font-medium tracking-widest text-accent">404</p>
      <h1 uiPageTitle class="mt-3">
        {{ heading() ?? text.notFoundTitle }}
      </h1>
      <p uiPageIntro class="mt-4">{{ body() ?? text.notFoundBody }}</p>
      <a uiButton variant="secondary" [routerLink]="backLink()" class="mt-8">
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
    setResponseStatus(404);
  }
}
