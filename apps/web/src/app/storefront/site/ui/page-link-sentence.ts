import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Link } from '@b2b-catalog-platform/ui/actions/link';

export interface PageLinkSentenceText {
  readonly text: string;
  readonly link: string;
  readonly after: string;
}

/**
 * A sentence beside a form that links one of the shop's pages. In a new tab:
 * following it in place would throw away what the person has typed.
 */
@Component({
  selector: 'app-page-link-sentence',
  imports: [RouterLink, Link],
  template: `
    {{ text().text }}
    <a uiLink [routerLink]="path()" target="_blank" rel="noopener">{{
      text().link
    }}</a
    >{{ text().after }}
  `,
})
export class PageLinkSentence {
  readonly path = input.required<string>();
  readonly text = input.required<PageLinkSentenceText>();
}
