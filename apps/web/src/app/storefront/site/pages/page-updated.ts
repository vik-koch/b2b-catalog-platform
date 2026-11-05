import { Component, computed, inject, input } from '@angular/core';
import {
  fillText,
  shopDay,
  shopTimeZone,
} from '@b2b-catalog-platform/shared/platform';
import { isDatedPage } from '@b2b-catalog-platform/shared/storefront/site';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { STOREFRONT_SITE_TEXT } from '../site-text';

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

  private readonly text = inject(STOREFRONT_SITE_TEXT).pageUpdated;
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly timeZone = shopTimeZone(this.config);

  protected readonly label = computed(() =>
    isDatedPage(this.slug())
      ? fillText(this.text.label, {
          date: shopDay(this.updatedAt(), this.config.locale, this.timeZone),
        })
      : null,
  );
}
