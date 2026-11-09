import { Component, inject } from '@angular/core';

import { PageIntro } from '@b2b-catalog-platform/ui/content/page-intro';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';

import { usePageSeo } from '../../../platform/page-seo';
import { setResponseStatus } from '../../platform/response-status';
import { STOREFRONT_SITE_TEXT } from '../site-text';

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
  protected readonly text = inject(STOREFRONT_SITE_TEXT).maintenance;

  constructor() {
    usePageSeo({ name: () => this.text.title });

    // A 503, never a 200 a crawler would index.
    setResponseStatus(503);
  }
}
