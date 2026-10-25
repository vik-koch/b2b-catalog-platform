import { Component, inject } from '@angular/core';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { usePageSeo } from '../../shared/core/page-seo';
import { NotFoundView } from './not-found-view';

/** The catch-all route: the shared 404 screen plus its page title. */
@Component({
  imports: [NotFoundView],
  selector: 'app-not-found',
  template: `<app-not-found-view />`,
})
export class NotFoundPage {
  private readonly text = inject(STOREFRONT_TEXT).errors;

  constructor() {
    usePageSeo({ name: () => this.text.notFoundTitle });
  }
}
