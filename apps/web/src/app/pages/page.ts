import { Component, inject, input, resource } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { PageService } from './page.service';

@Component({
  selector: 'app-page',
  template: `
    @if (pageResource.hasValue()) {
      <h1 class="mb-6 text-3xl font-bold tracking-tight">
        {{ pageResource.value().title }}
      </h1>
      <div
        class="prose prose-stone max-w-none"
        [innerHTML]="pageResource.value().bodyHtml"
      ></div>
    } @else if (pageResource.error()) {
      <h1 class="text-3xl font-bold tracking-tight">
        {{ text.cannotLoadTitle }}
      </h1>
      <p class="mt-4 text-stone-600">{{ text.cannotLoadBody }}</p>
    } @else {
      <div class="animate-pulse space-y-4" aria-hidden="true">
        <div class="h-8 w-1/3 rounded bg-stone-200"></div>
        <div class="h-4 w-full rounded bg-stone-200"></div>
        <div class="h-4 w-5/6 rounded bg-stone-200"></div>
      </div>
    }
  `,
})
export class Page {
  private pageService = inject(PageService);

  protected readonly text = inject(APP_TEXT).errors;

  slug = input.required<string>();
  pageResource = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.pageService.getPage(params.slug),
  });
}
