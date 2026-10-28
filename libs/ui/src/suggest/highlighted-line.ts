import { Component, input } from '@angular/core';

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * A line drawn from its runs, the matched ones marked. Each run is an element,
 * never markup: nothing reaches `innerHTML`.
 *
 * Every part must be an element: a run can end mid-word, and only
 * whitespace-only nodes between parts are dropped, so bare interpolation
 * splits the word with a space. A spec holds this.
 */
@Component({
  selector: 'ui-highlighted-line',
  template: `@for (part of segments(); track $index) {
    @if (part.match) {
      <mark class="rounded-sm bg-accent/25 text-inherit">{{ part.text }}</mark>
    } @else {
      <span>{{ part.text }}</span>
    }
  }`,
})
export class HighlightedLine {
  readonly segments = input.required<readonly HighlightSegment[]>();
}
