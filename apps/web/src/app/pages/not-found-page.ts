import { Component, inject } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { usePageSeo } from '../core/page-seo';
import { NotFoundView } from './not-found-view';

/** The catch-all route: the shared 404 screen plus its page title. */
@Component({
  imports: [NotFoundView],
  selector: 'app-not-found',
  template: `<app-not-found-view />`,
})
export class NotFoundPage {
  private readonly text = inject(APP_TEXT).errors;

  constructor() {
    usePageSeo({ name: () => this.text.notFoundTitle });
  }
}
