import { Component, inject, RESPONSE_INIT } from '@angular/core';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { usePageSeo } from '../../../shared/core/page-seo';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';

/** Fetches nothing: behind the gate the API would refuse it. */
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

    // A 503, never a 200 a crawler would index. Present during SSR only.
    const responseInit = inject(RESPONSE_INIT, { optional: true });
    if (responseInit) {
      responseInit.status = 503;
    }
  }
}
