import { Component, computed, input } from '@angular/core';
import { matchSegments } from './match-segments';

/**
 * One line of a suggestion with the matched runs marked. The runs are
 * elements built from `matchSegments`, never markup: nothing reaches
 * `innerHTML`.
 *
 * Every part must be an element: a run can end mid-word, and only
 * whitespace-only nodes between parts are dropped, so bare interpolation
 * splits the word with a space. A spec holds this.
 */
@Component({
  selector: 'app-highlighted-line',
  template: `@for (part of segments(); track $index) {
    @if (part.match) {
      <mark class="rounded-sm bg-accent/25 text-inherit">{{ part.text }}</mark>
    } @else {
      <span>{{ part.text }}</span>
    }
  }`,
})
export class HighlightedLine {
  readonly line = input.required<string>();
  /** The settled query, not the one being typed. */
  readonly query = input.required<string>();
  /** The same query read on a second keyboard layout. */
  readonly alternateQuery = input<string | null>(null);

  protected readonly segments = computed(() =>
    matchSegments(this.line(), this.query(), this.alternateQuery()),
  );
}
