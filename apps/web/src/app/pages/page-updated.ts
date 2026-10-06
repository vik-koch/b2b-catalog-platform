import { Component, computed, inject, input } from '@angular/core';
import { fillText, isDatedPage } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';

/**
 * "Last updated" under a legal page's text. The date is read in the shop's own
 * timezone, so the server render and the browser agree on the day. The
 * version number stays out: it counts saves, typo fixes included, and says
 * nothing a reader can use.
 */
@Component({
  selector: 'app-page-updated',
  host: { class: 'block text-sm text-subtle empty:hidden' },
  template: `
    @if (label(); as label) {
      {{ label }}
    }
  `,
})
export class PageUpdated {
  readonly slug = input.required<string>();
  /** ISO 8601, when the current version was saved. */
  readonly updatedAt = input.required<string>();

  private readonly text = inject(APP_TEXT).pageUpdated;
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly format = new Intl.DateTimeFormat(
    this.config.catalog.currency.locale,
    {
      dateStyle: 'long',
      timeZone: this.config.orderReference?.timezone ?? 'UTC',
    },
  );

  protected readonly label = computed(() =>
    isDatedPage(this.slug())
      ? fillText(this.text.label, {
          date: this.format.format(new Date(this.updatedAt())),
        })
      : null,
  );
}
