import { Component, inject, RESPONSE_INIT } from '@angular/core';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { usePageSeo } from '../../shared/core/page-seo';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';

/**
 * The public notice shown while maintenance mode is on (FR-ADM-04). Reached by
 * the maintenance gate redirect. Deliberately self-contained — it fetches no
 * catalog data (which the API would 503 anyway), so it renders cleanly behind
 * the gate.
 */
@Component({
  selector: 'app-maintenance-screen',
  imports: [PageTitle, PageIntro],
  template: `
    <section class="py-12 text-center sm:py-20">
      <h1 uiPageTitle class="mt-3">{{ text.title }}</h1>
      <p uiPageIntro class="mx-auto mt-4 max-w-xl">{{ text.body }}</p>
    </section>
  `,
})
export class MaintenanceScreen {
  protected readonly text = inject(STOREFRONT_TEXT).maintenance;

  constructor() {
    usePageSeo({ name: () => this.text.title });

    // Crawlers must receive a real 503 (temporary), never a styled 200 that
    // would invite indexing of the placeholder. The token only exists during
    // SSR; it is null in the browser and on client-side navigations.
    const responseInit = inject(RESPONSE_INIT, { optional: true });
    if (responseInit) {
      responseInit.status = 503;
    }
  }
}
