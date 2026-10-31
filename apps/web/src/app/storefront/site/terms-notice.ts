import { Component, computed, inject, resource } from '@angular/core';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { PageService } from '../../core/site/page.service';
import { PageLinkSentence } from './ui/page-link-sentence';

/**
 * Beside checkout's submit: sending the order accepts the terms, so a
 * statement rather than a box. Nothing for a page that is unpublished or
 * unwritten: the order then records no version and accepts none.
 */
@Component({
  selector: 'app-terms-notice',
  imports: [PageLinkSentence],
  template: `
    @if (shown()) {
      <app-page-link-sentence path="/terms" [text]="text" />
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

  // A failed read says nothing about the page being unwritten, and the server
  // records whatever version it finds, so the line stays.
  protected readonly shown = computed(() => {
    if (!this.published) return false;
    if (this.page.status() === 'error') return true;
    return this.page.hasValue() && this.page.value() !== null;
  });
}
