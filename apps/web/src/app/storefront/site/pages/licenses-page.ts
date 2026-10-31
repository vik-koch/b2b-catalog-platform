import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  PLATFORM_ID,
  computed,
  inject,
  resource,
} from '@angular/core';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { usePageSeo } from '../../../shared/core/page-seo';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { LicenseNotice, parseLicenseNotices } from './license-notice';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';

/**
 * Open-source attribution for the JavaScript this site sends to the browser.
 *
 * The bundle is distributed to every visitor, so the permissive licenses it
 * carries (MIT, BSD, Apache-2.0) want their notices to travel with it. This
 * page is that notice — reachable from the privacy and imprint prose, which is
 * where people go looking for it, and from the footer wherever the deployment
 * lists `licenses` in `pages.footerNav`. Whether the notice is *required* is a
 * question of jurisdiction, so the link is config; the route always answers.
 *
 * Its content is the build's own `3rdpartylicenses.txt`, fetched from the SSR
 * tier at /licenses.txt rather than compiled in: the bundler already knows
 * precisely which packages it shipped, so deriving the page from that artifact
 * keeps the two from ever disagreeing and keeps 140 kB of legal text out of
 * every visitor's bundle. Consequently this is not a Page slug either — there
 * is nothing here for an admin to edit.
 *
 * Fetched in the browser only. The notice file sits next to the server bundle
 * on disk, but a relative fetch has no origin during SSR, and a page of license
 * texts has nothing a crawler wants — so the server renders the heading and
 * intro, and the list arrives on hydration.
 */
@Component({
  selector: 'app-licenses-page',
  imports: [Skeleton, PageTitle, PageIntro],
  template: `
    <!-- A reading measure, like the static pages this page is read alongside:
         it is prose and a list of names, and a package name three words long
         stranded at the far edge of a wide screen is a line nobody follows
         back. -->
    <div class="max-w-3xl">
      <h1 uiPageTitle class="mb-2">{{ heading }}</h1>
      <p uiPageIntro class="mb-4">{{ text.intro }}</p>

      @if (notices(); as list) {
        @if (list.length === 0) {
          <p class="text-ink-subtle">{{ text.unavailable }}</p>
        } @else {
          <ul class="divide-y divide-edge border-t border-edge">
            @for (notice of list; track notice.name) {
              <li class="py-3">
                <details class="group">
                  <summary
                    class="flex cursor-pointer flex-wrap items-baseline
                           gap-x-3 gap-y-1 outline-offset-2
                           hover:text-accent"
                  >
                    <span class="font-medium">{{ notice.name }}</span>
                    <span class="text-sm text-ink-subtle">{{
                      notice.license ?? text.unknownLicense
                    }}</span>
                  </summary>
                  <pre
                    class="mt-3 overflow-x-auto rounded-sm bg-surface p-4
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

  protected readonly text = inject(STOREFRONT_TEXT).licenses;
  protected readonly heading = inject(SHARED_TEXT).nav['licenses'];

  // `undefined` is the server's answer — nothing was fetched, so the list stays
  // out of the rendered HTML entirely rather than briefly claiming to be empty.
  private readonly noticeResource = resource<LicenseNotice[] | undefined, void>(
    {
      loader: async ({ abortSignal }) => {
        if (!this.isBrowser) return undefined;
        const response = await fetch('/licenses.txt', { signal: abortSignal });
        // A development build extracts no licenses, so the file is absent. That
        // is a fact about the build, not a failure — say so and move on.
        if (!response.ok) return [];
        return parseLicenseNotices(await response.text());
      },
    },
  );

  // Guarded: `value()` throws on an errored resource, and a page that cannot
  // reach its own notice file should read like an empty one, not a crash.
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
