import { Component, input } from '@angular/core';
import { HighlightedLine, HighlightSegment } from './highlighted-line';

/**
 * One suggestion as a row draws it: the line the query matched, and under it
 * what tells two alike rows apart, projected and gone when there is none.
 *
 *   <ng-template uiSuggestRow [of]="list" let-item let-query="query">
 *     <ui-suggestion [segments]="item.name | matchSegments: query">
 *       {{ item.city }}
 *     </ui-suggestion>
 *   </ng-template>
 */
@Component({
  selector: 'ui-suggestion',
  imports: [HighlightedLine],
  host: { class: 'block min-w-0' },
  template: `
    <span class="block truncate">
      <ui-highlighted-line [segments]="segments()" />
    </span>
    <span class="block truncate text-xs text-ink-subtle empty:hidden">
      <ng-content />
    </span>
  `,
})
export class Suggestion {
  readonly segments = input.required<readonly HighlightSegment[]>();
}
