import { Component, input } from '@angular/core';
import { PageIntro } from './page-intro';
import { PageTitle } from './page-title';

/**
 * A screen that has ended: what happened, in a title and one sentence, and
 * the ways on, projected. `role` announces the sentence where it replaces a
 * form the person was just using.
 *
 *   <ui-outcome [title]="text.doneHeading" [message]="text.done">
 *     <a uiButton routerLink="/">{{ home }}</a>
 *   </ui-outcome>
 */
@Component({
  selector: 'ui-outcome',
  imports: [PageIntro, PageTitle],
  host: { class: 'block' },
  template: `
    <h1 uiPageTitle class="mb-4">{{ title() }}</h1>
    <p uiPageIntro [attr.role]="role()">{{ message() }}</p>
    <div class="mt-8 flex flex-wrap items-center gap-3 empty:hidden">
      <ng-content />
    </div>
  `,
})
export class Outcome {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly role = input<'alert' | 'status'>();
}
