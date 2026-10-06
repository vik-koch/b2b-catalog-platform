import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { Link } from '../ui/link';

/**
 * Beside checkout's submit button: sending the order accepts the terms of sale
 * (NFR-LEGAL-10). A statement, not a box, because submitting is the act.
 * Nothing where the deployment publishes no terms.
 */
@Component({
  selector: 'app-terms-notice',
  imports: [RouterLink, Link],
  template: `
    @if (published) {
      {{ text.text }}
      <a appLink routerLink="/terms" target="_blank" rel="noopener">{{
        text.link
      }}</a
      >.
    }
  `,
})
export class TermsNotice {
  protected readonly text = inject(APP_TEXT).termsNotice;
  protected readonly published =
    inject(DEPLOYMENT_CONFIG).pages.published.includes('terms');
}
