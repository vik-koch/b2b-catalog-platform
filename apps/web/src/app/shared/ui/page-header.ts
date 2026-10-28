import { Component, input } from '@angular/core';
import { PageIntro } from './page-intro';
import { PageTitle } from './page-title';

/**
 * A page's title with its actions at the end of the row, and the intro under
 * both. On a narrow screen the actions wrap below the title rather than
 * squeezing it.
 *
 *   <app-page-header [title]="text.title" [intro]="text.intro">
 *     <a appButton routerLink="new">{{ text.add }}</a>
 *   </app-page-header>
 */
@Component({
  selector: 'app-page-header',
  imports: [PageIntro, PageTitle],
  host: { class: 'block' },
  template: `
    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <h1 appPageTitle>{{ title() }}</h1>
      <div class="ml-auto flex flex-wrap justify-end gap-2 empty:hidden">
        <ng-content />
      </div>
    </div>
    @if (intro(); as intro) {
      <p appPageIntro class="mb-6 max-w-3xl">{{ intro }}</p>
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly intro = input<string>();
}
