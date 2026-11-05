import { Component, inject } from '@angular/core';
import { PageLinkSentence } from './ui/page-link-sentence';
import { SITE_CONFIG } from '../../core/site/site-config';
import { STOREFRONT_SITE_TEXT } from './site-text';

/**
 * How a form's personal details are handled. Owed whatever the processing
 * rests on, so it stands whether or not the form asks for consent.
 */
@Component({
  selector: 'app-privacy-notice',
  imports: [PageLinkSentence],
  template: `
    @if (published) {
      <app-page-link-sentence path="/privacy" [text]="text" />
    }
  `,
})
export class PrivacyNotice {
  protected readonly text = inject(STOREFRONT_SITE_TEXT).privacyNotice;
  protected readonly published =
    inject(SITE_CONFIG).pages.published.includes('privacy');
}
