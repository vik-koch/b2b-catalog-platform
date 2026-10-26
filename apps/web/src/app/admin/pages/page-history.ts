import { Component, inject, input, resource } from '@angular/core';
import { fillText, PageSlug } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { adminDayFormat } from '../grid/admin-date';
import { PageEditingService } from './page-editing.service';
import { trustedRichText } from '../../shared/core/trusted-rich-text';

/**
 * Every saved version of a page, newest first, each opening to what it said.
 * Read-only: a consent or an order points at a version, and the admin reads it
 * here; nothing is restored from it.
 */
@Component({
  selector: 'app-page-history',
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
              <details class="group">
                <summary
                  class="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-sm"
                >
                  <span class="font-medium">
                    {{ versionLabel(entry.version) }}
                  </span>
                  @if (first) {
                    <span class="text-subtle">{{ text.current }}</span>
                  }
                  <span class="text-subtle">{{ moment(entry.updatedAt) }}</span>
                  @if (entry.editorEmail) {
                    <span class="min-w-0 break-all text-subtle">
                      {{ entry.editorEmail }}
                    </span>
                  }
                </summary>
                <div class="pb-6">
                  <h3 class="mb-3 text-xl font-medium">{{ entry.title }}</h3>
                  @if (entry.consentLabel) {
                    <p class="mb-4 text-sm">
                      <span class="text-subtle">{{ text.consentLabel }}</span>
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
  protected readonly text = inject(ADMIN_TEXT).pages.history;
  protected readonly safeBody = trustedRichText();

  readonly slug = input.required<PageSlug>();

  protected readonly versions = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.pageService.listVersions(params.slug),
  });

  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;
  private readonly dayFormat = adminDayFormat(this.locale);
  private readonly timeFormat = new Intl.DateTimeFormat(this.locale, {
    timeStyle: 'short',
  });

  protected versionLabel(version: number): string {
    return fillText(this.text.version, { version: String(version) });
  }

  protected moment(iso: string): string {
    const at = new Date(iso);
    return `${this.dayFormat.format(at)} ${this.timeFormat.format(at)}`;
  }
}
