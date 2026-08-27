import { Component, computed, input } from '@angular/core';
import { matchSegments } from './match-segments';

/**
 * One line of a type-ahead row, with the parts the query matched marked in
 * place. Shared by the address and company fields so a query looks the same
 * wherever it is typed, and so the escaping rule is kept in one file: the runs
 * are elements built from `matchSegments`, never a marked-up string — nothing
 * here reaches `innerHTML`.
 *
 * A tint behind the run rather than color on the letters: the row is already
 * near-black text, and a colored run of it reads as a link rather than as a
 * hit. Accent rather than primary because primary faded to a tint is a grey —
 * it reads as a second selected row on top of the one the pointer is on.
 * `<mark>` because that is what the element means; its yellow default is
 * overridden, colors included.
 *
 * Every part must be an element. A highlight can end mid-word
 * ("Hafenstra|ße"), and the compiler only drops the newlines between the parts
 * while they are whitespace-only nodes — put bare interpolation here and the
 * word comes out split by a space. A test holds this.
 *
 * Inline by default, as a custom element is, so it flows inside the line that
 * holds it.
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
  /** The settled query the line answered, not the one being typed. */
  readonly query = input.required<string>();

  protected readonly segments = computed(() =>
    matchSegments(this.line(), this.query()),
  );
}
