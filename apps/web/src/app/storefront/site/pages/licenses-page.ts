import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  inject,
  PLATFORM_ID,
  resource,
} from '@angular/core';

import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { DetailsSummary } from '@b2b-catalog-platform/ui/disclosure/details-summary';

import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { delayedLoading } from '../../../platform/delayed-loading';
import { usePageSeo } from '../../../platform/page-seo';
import { STOREFRONT_SITE_TEXT } from '../site-text';
import { LicenseNotice, parseLicenseNotices } from './license-notice';

/**
 * The notices of the JavaScript the site ships, from the build's own
 * `3rdpartylicenses.txt`: it cannot disagree with the bundle, and 140 kB of
 * legal text stays out of it. Fetched in the browser only: a relative fetch has
 * no origin during SSR, and a crawler wants none of it.
 */
@Component({
  selector: 'app-licenses-page',
  imports: [Skeleton, PageTitle, PageIntro, DetailsSummary],
  template: `
    <div class="max-w-3xl">
      <h1 uiPageTitle class="mb-2">{{ heading }}</h1>
      <p uiPageIntro class="mb-4">{{ text.intro }}</p>

      @if (notices(); as list) {
        @if (list.length === 0) {
          <p class="text-ink-subtle">{{ text.unavailable }}</p>
        } @else {
          <ul class="divide-y divide-edge border-t border-edge">
            @for (notice of list; track notice.name) {
              <li>
                <details>
                  <summary uiDetailsSummary>
                    <span class="font-medium">{{ notice.name }}</span>
                    <span class="text-sm text-ink-subtle">{{
                      notice.license ?? text.unknownLicense
                    }}</span>
                  </summary>
                  <pre
                    class="mb-3 overflow-x-auto rounded-sm bg-surface p-4
                           text-xs whitespace-pre-wrap text-ink-subtle"
                    >{{ notice.text }}</pre>
                </details>
              </li>
            }
          </ul>
        }
      } @else if (showSkeleton()) {
        <ui-skeleton [lines]="6" />
      }
    </div>
  `,
})
export class LicensesPage {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly text = inject(STOREFRONT_SITE_TEXT).licenses;
  protected readonly heading = inject(SHARED_TEXT).nav['licenses'];

  // `undefined` on the server, so the list is absent rather than empty.
  private readonly noticeResource = resource<LicenseNotice[] | undefined, void>(
    {
      loader: async ({ abortSignal }) => {
        if (!this.isBrowser) return undefined;
        const response = await fetch('/licenses.txt', { signal: abortSignal });
        // A development build extracts no licenses.
        if (!response.ok) return [];
        return parseLicenseNotices(await response.text());
      },
    },
  );

  // Guarded: `value()` throws on an errored resource.
  protected readonly notices = computed(() =>
    this.noticeResource.hasValue() ? this.noticeResource.value() : undefined,
  );

  protected readonly showSkeleton = delayedLoading(
    this.noticeResource.isLoading,
  );

  constructor() {
    usePageSeo({ name: () => this.heading });
  }
}
