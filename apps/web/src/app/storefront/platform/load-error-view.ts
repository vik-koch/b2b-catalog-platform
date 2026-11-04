import { Component, inject, input } from '@angular/core';
import { STOREFRONT_TEXT } from '../../platform/config/storefront-text';
import { setResponseStatus } from '../../platform/response-status';
import { Outcome } from '@b2b-catalog-platform/ui/content/outcome';

/** A page whose data could not be loaded, as a 503: a 200 would invite a
 * crawler to index the apology and tell every monitor the site is healthy. */
@Component({
  selector: 'app-load-error-view',
  imports: [Outcome],
  template: `
    @if (heading(); as heading) {
      <ui-outcome
        [title]="heading"
        [message]="message() ?? text.cannotLoadBody"
      />
    } @else {
      <p class="text-ink-subtle">{{ message() ?? text.cannotLoadBody }}</p>
    }
  `,
})
export class LoadErrorView {
  protected readonly text = inject(STOREFRONT_TEXT).errors;

  /** Set to render a full page-level error; omit for an inline one. */
  readonly heading = input<string | null>(null);
  readonly message = input<string | null>(null);

  constructor() {
    setResponseStatus(503);
  }
}
