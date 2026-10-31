import { Component, inject } from '@angular/core';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { PageLinkSentence } from './ui/page-link-sentence';

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
  protected readonly text = inject(STOREFRONT_TEXT).privacyNotice;
  protected readonly published =
    inject(DEPLOYMENT_CONFIG).pages.published.includes('privacy');
}
