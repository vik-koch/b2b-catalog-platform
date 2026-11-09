import { Component, inject } from '@angular/core';

import { Link } from '@b2b-catalog-platform/ui/actions/link';

import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';

/** The deployment's notice (FR-NAV-08) above the header: not dismissable,
 * and a plain line rather than an alert, as it is never news. */
@Component({
  selector: 'app-shop-notice',
  imports: [Link],
  template: `
    @if (notice; as notice) {
      <div class="bg-primary/10 px-4 py-1.5 text-center text-sm text-ink">
        <p class="mx-auto max-w-328">
          {{ notice.text }}
          <!-- Inline-block, so the label wraps whole. -->
          @if (notice.link; as link) {
            <a uiLink class="inline-block" [href]="link.url">{{
              link.label
            }}</a>
          }
        </p>
      </div>
    }
  `,
})
export class ShopNotice {
  protected readonly notice = inject(DEPLOYMENT_CONFIG).notice;
}
