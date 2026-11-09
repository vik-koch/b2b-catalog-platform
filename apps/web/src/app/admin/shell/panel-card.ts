import { Component, computed, input } from '@angular/core';

import { Card } from '@b2b-catalog-platform/ui/content/card';
import { SectionTitle } from '@b2b-catalog-platform/ui/content/section-title';
import { Glyph } from '@b2b-catalog-platform/ui/icons/glyph';

/**
 * One section of the panel: a heading with its glyph over a card of
 * `app-panel-row`s, the card a list named by the heading, as several row
 * labels also appear in the site header.
 */
@Component({
  selector: 'app-panel-card',
  imports: [Card, SectionTitle],
  host: { class: 'block' },
  template: `
    <section>
      <h2 [id]="headingId()" uiSectionTitle class="mb-1.5" [glyph]="glyph()">
        {{ heading() }}
      </h2>
      <!-- overflow-hidden: a row's square hover ground would paint over the
           card's corners. -->
      <ul
        uiCard
        [padded]="false"
        class="divide-y divide-edge overflow-hidden"
        [attr.aria-labelledby]="headingId()"
      >
        <ng-content />
      </ul>
    </section>
  `,
})
export class PanelCard {
  /** Names the heading's id, `admin-<key>-heading`. */
  readonly key = input.required<string>();
  readonly heading = input.required<string>();
  readonly glyph = input.required<Glyph>();

  protected readonly headingId = computed(() => `admin-${this.key()}-heading`);
}
