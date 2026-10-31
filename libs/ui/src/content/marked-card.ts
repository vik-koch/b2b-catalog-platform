import { Component, input } from '@angular/core';
import { Card } from './card';
import { Icon } from '../icons/icon';
import { Glyph } from '../icons/glyph';

/**
 * A card whose glyph marks what kind of thing it holds, the content beside
 * it. Without a mark it is a plain card.
 *
 *   <li uiMarkedCard [mark]="mapPinIcon">…</li>
 */
@Component({
  selector: '[uiMarkedCard]',
  imports: [Icon],
  hostDirectives: [Card],
  host: { class: 'flex gap-3' },
  template: `
    @if (mark(); as mark) {
      <!-- mt-0.5 sets the glyph on the first line of a base-size text. -->
      <ui-icon [glyph]="mark" class="mt-0.5 size-5 shrink-0 text-ink-subtle" />
    }
    <div class="min-w-0 flex-1"><ng-content /></div>
  `,
})
export class MarkedCard {
  readonly mark = input<Glyph | null>(null);
}
