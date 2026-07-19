import { Component, inject, input, resource } from '@angular/core';
import { PageService } from './page.service';

@Component({
  selector: 'app-page',
  template: `
    @if (pageResource.hasValue()) {
      <h1>{{ pageResource.value().title }}</h1>
      <div [innerHTML]="pageResource.value().bodyHtml"></div>
    } @else if (pageResource.error()) {
      <h1>Cannot load page</h1>
    } @else {
      <p>Loading…</p>
    }
  `,
})
export class Page {
  private pageService = inject(PageService);

  slug = input.required<string>();
  pageResource = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.pageService.getPage(params.slug),
  });
}
