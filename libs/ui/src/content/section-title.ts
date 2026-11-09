import { Component, input } from '@angular/core';

import { Glyph } from '../icons/glyph';
import { Icon } from '../icons/icon';

/**
 * A small-caps heading over a section of a page or panel, with an optional
 * glyph ahead of its words. Spacing stays with the caller.
 *
 *   <h2 uiSectionTitle class="mb-3">{{ text.specifications }}</h2>
 *   <h2 uiSectionTitle class="mb-1.5" [glyph]="lockIcon">…</h2>
 */
@Component({
  selector: '[uiSectionTitle]',
  imports: [Icon],
  host: {
    class: 'text-xs font-medium tracking-wide text-ink-subtle uppercase',
    '[class.flex]': 'glyph()',
    '[class.items-center]': 'glyph()',
    '[class.gap-2]': 'glyph()',
  },
  template: `
    @if (glyph(); as glyph) {
      <ui-icon [glyph]="glyph" class="size-4" />
    }
    <ng-content />
  `,
})
export class SectionTitle {
  readonly glyph = input<Glyph | null>(null);
}
