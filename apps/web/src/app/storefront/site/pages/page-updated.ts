import { Component, computed, inject, input } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { isDatedPage } from '@b2b-catalog-platform/shared/storefront/site';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';

/**
 * The date in the shop's timezone, so server and browser agree on the day. No
 * version number: it counts saves, typo fixes included.
 */
@Component({
  selector: 'app-page-updated',
  host: { class: 'block text-sm text-ink-subtle empty:hidden' },
  template: `
    @if (label(); as label) {
      {{ label }}
    }
  `,
})
export class PageUpdated {
  readonly slug = input.required<string>();
  readonly updatedAt = input.required<string>();

  private readonly text = inject(STOREFRONT_TEXT).pageUpdated;
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly format = new Intl.DateTimeFormat(this.config.locale, {
    dateStyle: 'long',
    timeZone: this.config.orderReference?.timezone ?? 'UTC',
  });

  protected readonly label = computed(() =>
    isDatedPage(this.slug())
      ? fillText(this.text.label, {
          date: this.format.format(new Date(this.updatedAt())),
        })
      : null,
  );
}
