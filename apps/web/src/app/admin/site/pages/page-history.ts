import { Component, inject, input, resource } from '@angular/core';

import { PageSlug } from '@b2b-catalog-platform/shared/core/site';
import { fillText, shopTimeZone } from '@b2b-catalog-platform/shared/platform';
import { DetailsSummary } from '@b2b-catalog-platform/ui/disclosure/details-summary';

import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { trustedRichText } from '../../../platform/trusted-rich-text';
import { adminDayFormat } from '../../platform/dates/admin-date';
import { ADMIN_SITE_TEXT } from '../site-text';
import { PageEditingService } from './page-editing.service';

/**
 * Read-only: a consent or an order points at a version, and the admin reads it
 * here; nothing is restored from it.
 */
@Component({
  selector: 'app-page-history',
  imports: [DetailsSummary],
  template: `
    @if (versions.hasValue() && versions.value().length > 0) {
      <section class="mt-12 max-w-3xl">
        <h2 class="mb-3 text-lg font-medium">{{ text.heading }}</h2>
        <ul class="divide-y divide-edge border-y border-edge">
          @for (
            entry of versions.value();
            track entry.version;
            let first = $first
          ) {
            <li>
              <details>
                <summary uiDetailsSummary class="text-sm">
                  <span class="font-medium">
                    {{ versionLabel(entry.version) }}
                  </span>
                  @if (first) {
                    <span class="text-ink-subtle">{{ text.current }}</span>
                  }
                  <span class="text-ink-subtle">{{
                    moment(entry.updatedAt)
                  }}</span>
                  @if (entry.editorEmail) {
                    <span class="min-w-0 break-all text-ink-subtle">
                      {{ entry.editorEmail }}
                    </span>
                  }
                </summary>
                <div class="pb-6">
                  <h3 class="mb-3 text-xl font-medium">{{ entry.title }}</h3>
                  @if (entry.consentLabel) {
                    <p class="mb-4 text-sm">
                      <span class="text-ink-subtle">{{
                        text.consentLabel
                      }}</span>
                      {{ entry.consentLabel }}
                    </p>
                  }
                  <div
                    class="prose max-w-none"
                    [innerHTML]="safeBody(entry.bodyHtml)"
                  ></div>
                </div>
              </details>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class PageHistory {
  private readonly pageService = inject(PageEditingService);
  protected readonly text = inject(ADMIN_SITE_TEXT).pages.history;
  protected readonly safeBody = trustedRichText();

  readonly slug = input.required<PageSlug>();

  protected readonly versions = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.pageService.listVersions(params.slug),
  });

  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly locale = this.config.locale;
  private readonly timeZone = shopTimeZone(this.config);
  private readonly dayFormat = adminDayFormat(this.locale, this.timeZone);
  private readonly timeFormat = new Intl.DateTimeFormat(this.locale, {
    timeStyle: 'short',
    timeZone: this.timeZone,
  });

  protected versionLabel(version: number): string {
    return fillText(this.text.version, { version: String(version) });
  }

  protected moment(iso: string): string {
    const at = new Date(iso);
    return `${this.dayFormat.format(at)} ${this.timeFormat.format(at)}`;
  }
}
