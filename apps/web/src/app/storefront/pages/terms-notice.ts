import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { PageService } from '../../shared/pages/page.service';

/**
 * Beside checkout's submit button: sending the order accepts the terms of sale
 * (NFR-LEGAL-10). A statement, not a box, because submitting is the act.
 * Nothing where the deployment publishes no terms, or publishes a page nobody
 * has written yet: the order then records no version, so it accepts none.
 */
@Component({
  selector: 'app-terms-notice',
  imports: [RouterLink, Link],
  template: `
    @if (shown()) {
      {{ text.text }}
      <a uiLink routerLink="/terms" target="_blank" rel="noopener">{{
        text.link
      }}</a
      >{{ text.after }}
    }
  `,
})
export class TermsNotice {
  protected readonly text = inject(STOREFRONT_TEXT).termsNotice;
  private readonly pages = inject(PageService);
  private readonly published =
    inject(DEPLOYMENT_CONFIG).pages.published.includes('terms');

  private readonly page = resource({
    params: () => (this.published ? { slug: 'terms' } : undefined),
    loader: ({ params }) => this.pages.getPage(params.slug),
  });

  // Held back only once the page is known to be unwritten. A read that fails
  // says nothing about that, and the order still records whatever version the
  // server finds, so the line stays.
  protected readonly shown = computed(() => {
    if (!this.published) return false;
    if (this.page.status() === 'error') return true;
    return this.page.hasValue() && this.page.value() !== null;
  });
}
