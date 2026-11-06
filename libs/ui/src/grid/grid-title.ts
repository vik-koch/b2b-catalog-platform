import { Component, input } from '@angular/core';

/**
 * A record's name in a grid row, wrapping to three lines. An optional key
 * trails the name in the same flow, so a wrapping name does not push it onto
 * a line of its own. The link is projected, since rows open a route or a file.
 *
 *   <ui-grid-title [key]="item.sourceId">
 *     <a uiGridTitleLink [routerLink]="…">{{ item.name }}</a>
 *   </ui-grid-title>
 */
@Component({
  selector: 'ui-grid-title',
  // The word spacing is the gap before the key; the link resets it.
  host: { class: 'line-clamp-3 wrap-break-word [word-spacing:0.25rem]' },
  template: `<ng-content />
    @if (key(); as key) {
      &ngsp;<span
        class="inline-block max-w-full truncate rounded-sm bg-surface px-1.5
               py-0.5 align-middle font-mono text-xs [word-spacing:normal]"
        [title]="key"
        >{{ key }}</span
      >
    }`,
})
export class GridTitle {
  readonly key = input<string | null>();
}
