import { Component, inject } from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { Link } from '../ui/link';

/**
 * The deployment's notice (FR-NAV-08), on a line of its own above the header:
 * that the shop is a demonstration, or closed over the holidays. It cannot be
 * dismissed, so every visit reads the same, and it wraps on a narrow screen
 * rather than being cut off. Nothing at all when the deployment sets none.
 *
 * A plain line rather than a landmark or an alert: it is part of every page,
 * read in order like the header after it, and never news.
 */
@Component({
  selector: 'app-site-notice',
  imports: [Link],
  template: `
    @if (notice; as notice) {
      <div class="bg-primary/10 px-4 py-1.5 text-center text-sm text-ink">
        <p class="mx-auto max-w-328">
          {{ notice.text }}
          <!-- Inline-block, so a short label moves to the next line whole
               rather than breaking between its words. -->
          @if (notice.link; as link) {
            <a appLink class="inline-block" [href]="link.url">{{
              link.label
            }}</a>
          }
        </p>
      </div>
    }
  `,
})
export class SiteNotice {
  protected readonly notice = inject(DEPLOYMENT_CONFIG).notice;
}
