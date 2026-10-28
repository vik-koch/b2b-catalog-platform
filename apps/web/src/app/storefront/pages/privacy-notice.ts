import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { Link } from '@b2b-catalog-platform/ui/actions/link';

/**
 * Where a form that takes personal details says how they are handled
 * (NFR-LEGAL-01). Information the shop owes whatever the processing rests on,
 * so it stands whether or not the form asks for consent. Nothing where the
 * deployment publishes no privacy page.
 */
@Component({
  selector: 'app-privacy-notice',
  imports: [RouterLink, Link],
  template: `
    @if (published) {
      {{ text.text }}
      <a appLink routerLink="/privacy" target="_blank" rel="noopener">{{
        text.link
      }}</a
      >{{ text.after }}
    }
  `,
})
export class PrivacyNotice {
  protected readonly text = inject(STOREFRONT_TEXT).privacyNotice;
  protected readonly published =
    inject(DEPLOYMENT_CONFIG).pages.published.includes('privacy');
}
