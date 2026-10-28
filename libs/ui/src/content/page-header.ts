import { Component, input } from '@angular/core';
import { PageIntro } from './page-intro';
import { PageTitle } from './page-title';

/**
 * A page's title with its actions at the end of the row, and the intro under
 * both. On a narrow screen the actions wrap below the title rather than
 * squeezing it.
 *
 *   <ui-page-header [title]="text.title" [intro]="text.intro">
 *     <a uiButton routerLink="new">{{ text.add }}</a>
 *   </ui-page-header>
 */
@Component({
  selector: 'ui-page-header',
  imports: [PageIntro, PageTitle],
  host: { class: 'block' },
  template: `
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <h1 uiPageTitle>{{ title() }}</h1>
      <div class="ml-auto flex flex-wrap justify-end gap-2 empty:hidden">
        <ng-content />
      </div>
    </div>
    @if (intro(); as intro) {
      <p uiPageIntro class="mb-6 max-w-3xl">{{ intro }}</p>
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly intro = input<string>();
}
